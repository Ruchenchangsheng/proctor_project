# -*- coding: utf-8 -*-
"""
人脸识别 + 实时异常检测服务（FastAPI）

接口说明：
- /health
- /embed
- /verify
- /anomaly/frame

本版本重点：
1. 人脸注册与 1:1 核验仍然使用 insightface。
2. 异常检测改为对齐 Abnormal_behavior_detection_model 的训练口径：
   - 24 维逐帧特征
   - 8 秒滑窗 / 2 秒步进
   - 多标签 sigmoid 推理
   - 按类别独立做 enter / exit 事件聚合
"""

from collections import defaultdict, deque
import logging
import os
import time

import cv2
from fastapi import FastAPI, File, Form, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from insightface.app import FaceAnalysis
import numpy as np
from pydantic import BaseModel

try:
    import onnxruntime as ort
except Exception:
    ort = None

try:
    import torch
except Exception:
    torch = None

from runtime_anomaly_support import (
    HybridSeqModel,
    RuntimeFeatureExtractor,
    build_class_rules,
    choose_anomaly_model_path,
    extract_torch_checkpoint_meta,
    parse_labels,
    resample_features_by_time,
    sigmoid_np,
)


log = logging.getLogger("vision-recognition-service")

app = FastAPI(title="FaceSvc", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

face_app = FaceAnalysis(name="buffalo_l", providers=["CPUExecutionProvider"])
face_app.prepare(ctx_id=0, det_size=(640, 640))


def imread_bgr(data: bytes):
    arr = np.frombuffer(data, np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("image decode failed")
    return img


class VerifyResp(BaseModel):
    ok: bool
    score: float
    threshold: float


@app.get("/health")
def health():
    return {"ok": True}


@app.post("/embed")
async def embed(file: UploadFile = File(...)):
    try:
        img = imread_bgr(await file.read())
    except Exception:
        return {"ok": False, "msg": "bad image"}

    try:
        faces = face_app.get(img)
    except Exception:
        return {"ok": False, "msg": "extract failed"}

    if not faces:
        return {"ok": False, "msg": "no face"}

    faces.sort(key=lambda item: float(item.det_score), reverse=True)
    face = faces[0]
    x1, y1, x2, y2 = [int(v) for v in face.bbox]
    return {
        "ok": True,
        "face_count": len(faces),
        "embedding": face.normed_embedding.tolist(),
        "det": float(face.det_score),
        "bbox": [x1, y1, x2, y2],
        "size": {"w": int(x2 - x1), "h": int(y2 - y1)},
    }


@app.post("/verify", response_model=VerifyResp)
async def verify(
    file: UploadFile = File(...),
    target: str = Form(...),
    threshold: float = Form(0.35),
):
    try:
        img = imread_bgr(await file.read())
    except Exception:
        return VerifyResp(ok=False, score=0.0, threshold=threshold)

    try:
        faces = face_app.get(img)
    except Exception:
        return VerifyResp(ok=False, score=0.0, threshold=threshold)

    if not faces:
        return VerifyResp(ok=False, score=0.0, threshold=threshold)

    faces.sort(key=lambda item: float(item.det_score), reverse=True)
    curr = faces[0].normed_embedding
    tgt = np.array(np.fromstring(target.strip("[]"), sep=","), dtype=np.float32)
    if tgt.shape != curr.shape:
        return VerifyResp(ok=False, score=0.0, threshold=threshold)

    score = float(np.dot(curr, tgt))
    return VerifyResp(ok=(score >= threshold), score=score, threshold=threshold)


class OnlineAnomalyDetector:
    """
    在线异常检测器。

    设计原则：
    1. 不再假设浏览器真的稳定上传 30fps，而是使用时间戳重采样。
    2. 每个异常标签维护独立状态，允许同一时间并发出现多种异常。
    3. 推理结果使用 sigmoid，多标签概率分别做 enter / exit 判断。
    """

    def __init__(self):
        self.target_fps = int(os.getenv("ANOMALY_FPS", "30"))
        self.win_sec = int(os.getenv("ANOMALY_WINDOW_SEC", "8"))
        self.step_sec = int(os.getenv("ANOMALY_STEP_SEC", "2"))
        self.window_ms = self.win_sec * 1000
        self.step_ms = self.step_sec * 1000
        self.target_len = self.target_fps * self.win_sec
        self.tail_sec = float(os.getenv("ANOMALY_SCORE_TAIL_SEC", "1.0"))
        self.tail_frames = max(1, int(round(self.target_fps * self.tail_sec)))
        self.enter_th = float(os.getenv("ANOMALY_ENTER_TH", "0.50"))
        self.exit_th = float(os.getenv("ANOMALY_EXIT_TH", "0.40"))
        self.smooth_alpha = float(os.getenv("ANOMALY_SMOOTH_ALPHA", "0.65"))

        # 至少保留 5fps 的有效采样，否则时间重采样后的序列信息不足。
        self.min_required_samples = max(8, int(self.win_sec * 5))

        self.labels = parse_labels(os.getenv("ANOMALY_LABELS"))
        self.class_rules = build_class_rules(self.labels, self.enter_th, self.exit_th)

        self.feature_extractor = RuntimeFeatureExtractor()
        self.buffers = defaultdict(deque)
        self.feature_states = defaultdict(dict)
        self.last_eval_ts = {}
        self.smoothed_probs = {}
        self.states = defaultdict(dict)

        self.model_backend = "rule"
        self.onnx_sess = None
        self.onnx_input_name = None
        self.torch_model = None
        self.torch_device = "cpu"

        explicit_model_path = os.getenv("ANOMALY_MODEL_PATH", "").strip()
        model_path = choose_anomaly_model_path(explicit_model_path or None)
        backend = os.getenv("ANOMALY_MODEL_BACKEND", "auto").strip().lower()

        if backend in ("auto", "torch"):
            self._try_load_torch(model_path)
        if self.torch_model is None and backend in ("auto", "onnx"):
            self._try_load_onnx(model_path)

        if self.torch_model is not None:
            self.model_backend = "torch"
        elif self.onnx_sess is not None:
            self.model_backend = "onnx"
        else:
            self.model_backend = "rule"

        log.warning(
            "anomaly detector ready: backend=%s, labels=%s, target_fps=%s, win_sec=%s, step_sec=%s",
            self.model_backend,
            ",".join(self.labels),
            self.target_fps,
            self.win_sec,
            self.step_sec,
        )

    def _sync_labels(self, n_classes: int | None):
        if not n_classes:
            return
        self.labels = parse_labels(os.getenv("ANOMALY_LABELS"), expected_count=n_classes)
        self.class_rules = build_class_rules(self.labels, self.enter_th, self.exit_th)

    def _try_load_torch(self, model_path: str):
        if torch is None:
            return
        if not model_path.endswith((".pt", ".pth", ".ckpt")):
            return
        if not os.path.exists(model_path):
            return

        try:
            ckpt = torch.load(model_path, map_location=self.torch_device)
            state_dict, in_dim, n_classes = extract_torch_checkpoint_meta(ckpt)
            if not state_dict:
                return

            in_dim = int(in_dim or 24)
            n_classes = int(n_classes or len(self.labels))
            self._sync_labels(n_classes)

            model = HybridSeqModel(in_dim=in_dim, n_classes=n_classes)
            missing, unexpected = model.load_state_dict(state_dict, strict=False)
            if missing or unexpected:
                log.warning("torch checkpoint partially loaded: missing=%s unexpected=%s", missing, unexpected)
            model.eval()
            self.torch_model = model
        except Exception as exc:
            log.warning("load torch anomaly model failed: %s", exc)
            self.torch_model = None

    def _try_load_onnx(self, model_path: str):
        if ort is None:
            return
        if not model_path.endswith(".onnx"):
            return
        if not os.path.exists(model_path):
            return

        try:
            self.onnx_sess = ort.InferenceSession(model_path, providers=["CPUExecutionProvider"])
            self.onnx_input_name = self.onnx_sess.get_inputs()[0].name
        except Exception as exc:
            log.warning("load onnx anomaly model failed: %s", exc)
            self.onnx_sess = None
            self.onnx_input_name = None

    def _infer_torch(self, feats_np: np.ndarray) -> np.ndarray | None:
        if self.torch_model is None or torch is None:
            return None

        with torch.no_grad():
            x = torch.from_numpy(feats_np).float().unsqueeze(0)
            logits = self.torch_model(x).detach().cpu().numpy()
        return self._logits_to_probs(logits)

    def _infer_onnx(self, feats_np: np.ndarray) -> np.ndarray | None:
        if self.onnx_sess is None:
            return None
        logits = self.onnx_sess.run(None, {self.onnx_input_name: feats_np[np.newaxis, ...].astype(np.float32)})[0]
        return self._logits_to_probs(logits)

    def _logits_to_probs(self, logits: np.ndarray) -> np.ndarray:
        logits = np.asarray(logits, dtype=np.float32)
        if logits.ndim == 3:
            # 使用尾部 1 秒左右的帧概率均值，降低单帧抖动。
            seq_probs = sigmoid_np(logits[0])
            tail = seq_probs[-self.tail_frames:] if seq_probs.shape[0] > self.tail_frames else seq_probs
            probs = tail.mean(axis=0)
        elif logits.ndim == 2:
            probs = sigmoid_np(logits[0])
        else:
            probs = sigmoid_np(logits.reshape(-1))
        return probs.astype(np.float32)

    def _fallback_probs(self, feats_np: np.ndarray) -> np.ndarray:
        """
        当模型未能加载时，仍然输出一组与训练标签一致的近似分数，
        这样后端和前端不需要再额外兼容另一套标签体系。
        """
        last = feats_np[-min(len(feats_np), self.tail_frames):]
        yaw = float(last[:, 5].mean())
        pitch = float(last[:, 6].mean())
        face_none = float(last[:, 13].mean())
        face_multi = float(last[:, 15].mean())
        people_none = float(last[:, 16].mean())
        people_multi = float(last[:, 18].mean())
        torso_vis = float(last[:, 19].mean())
        other_area_ratio = float(last[:, 20].mean())
        mar = float(last[:, 23].mean())

        scores = {
            "look_left": np.clip(max(0.0, -yaw - 10.0) / 20.0, 0.0, 1.0),
            "look_right": np.clip(max(0.0, yaw - 10.0) / 20.0, 0.0, 1.0),
            "look_down": np.clip(max(0.0, pitch - 8.0) / 18.0, 0.0, 1.0),
            "look_offscreen": np.clip(max(0.0, abs(yaw) - 20.0) / 20.0, 0.0, 1.0),
            "face_not_visible": np.clip(max(face_none, 1.0 - torso_vis - 0.2), 0.0, 1.0),
            "talking": np.clip(max(0.0, mar - 0.35) / 0.25, 0.0, 1.0),
            "other_person_present": np.clip(max(people_multi, other_area_ratio * 2.5), 0.0, 1.0),
            "other_limb_present": np.clip(max(0.0, other_area_ratio - 0.08) / 0.22, 0.0, 1.0),
            "multi_face": np.clip(face_multi, 0.0, 1.0),
            "leave_seat": np.clip(max(people_none, (0.25 - torso_vis) / 0.25), 0.0, 1.0),
        }
        return np.array([scores.get(label, 0.0) for label in self.labels], dtype=np.float32)

    def infer_window(self, feats_np: np.ndarray) -> np.ndarray:
        try:
            if self.model_backend == "torch":
                probs = self._infer_torch(feats_np)
                if probs is not None:
                    return probs
            if self.model_backend == "onnx":
                probs = self._infer_onnx(feats_np)
                if probs is not None:
                    return probs
        except Exception as exc:
            log.warning("anomaly infer failed, fallback to rules: %s", exc)
        return self._fallback_probs(feats_np)

    def _prune_buffer(self, buf: deque, now_ms: int):
        keep_after = now_ms - max(self.window_ms * 2, self.window_ms + self.step_ms * 2)
        while buf and buf[0][0] < keep_after:
            buf.popleft()

    def _build_events(self, key: str, now_ms: int, probs: np.ndarray) -> list[dict]:
        per_label_states = self.states[key]
        events = []

        for idx, label in enumerate(self.labels):
            rule = self.class_rules[label]
            prob = float(probs[idx]) if idx < len(probs) else 0.0
            state = per_label_states.get(label, {"active": False, "enter_ts": 0, "peak_score": 0.0})

            if not state["active"] and prob >= rule.enter_th:
                state = {"active": True, "enter_ts": now_ms, "peak_score": prob}
                events.append({
                    "type": "enter",
                    "label": label,
                    "ts_ms": now_ms,
                    "score": round(prob, 6),
                    "probability": round(prob, 6),
                    "min_dur_ms": rule.min_dur_ms,
                    "start_ts_ms": now_ms,
                    "end_ts_ms": now_ms,
                })
            elif state["active"]:
                state["peak_score"] = max(float(state.get("peak_score", 0.0)), prob)
                if prob < rule.exit_th:
                    enter_ts = int(state.get("enter_ts") or now_ms)
                    duration_ms = max(0, now_ms - enter_ts)
                    if duration_ms >= rule.min_dur_ms:
                        peak = float(state.get("peak_score") or prob)
                        events.append({
                            "type": "exit",
                            "label": label,
                            "ts_ms": now_ms,
                            "score": round(peak, 6),
                            "probability": round(peak, 6),
                            "duration_ms": duration_ms,
                            "min_dur_ms": rule.min_dur_ms,
                            "start_ts_ms": enter_ts,
                            "end_ts_ms": now_ms,
                        })
                    state = {"active": False, "enter_ts": 0, "peak_score": 0.0}

            per_label_states[label] = state

        self.states[key] = per_label_states
        return events

    def update(self, room_id: int, student_id: int, ts_ms: int, bgr: np.ndarray) -> list[dict]:
        now_ms = ts_ms or int(time.time() * 1000)
        key = f"{room_id}:{student_id}"

        temporal_state = self.feature_states[key]
        feat = self.feature_extractor.extract(bgr, temporal_state)

        buf = self.buffers[key]
        buf.append((now_ms, feat))
        self._prune_buffer(buf, now_ms)

        last_eval = self.last_eval_ts.get(key, 0)
        if now_ms - last_eval < self.step_ms:
            return []

        window_start = now_ms - self.window_ms
        window_samples = [(ts, item) for ts, item in buf if ts >= window_start]
        if len(window_samples) < self.min_required_samples:
            return []

        span_ms = window_samples[-1][0] - window_samples[0][0]
        if span_ms < int(self.window_ms * 0.9):
            return []

        feats_np = resample_features_by_time(window_samples, self.target_len)
        raw_probs = self.infer_window(feats_np)
        prev_probs = self.smoothed_probs.get(key)
        if prev_probs is None:
            smoothed = raw_probs
        else:
            smoothed = self.smooth_alpha * raw_probs + (1.0 - self.smooth_alpha) * prev_probs
        self.smoothed_probs[key] = smoothed
        self.last_eval_ts[key] = now_ms

        return self._build_events(key, now_ms, smoothed)


detector = OnlineAnomalyDetector()


@app.post("/anomaly/frame")
async def anomaly_frame(
    file: UploadFile = File(...),
    room_id: int = Form(...),
    student_id: int = Form(...),
    ts_ms: int = Form(0),
):
    img = imread_bgr(await file.read())
    events = detector.update(room_id, student_id, ts_ms, img)
    return {
        "ok": True,
        "fps": detector.target_fps,
        "window_sec": detector.win_sec,
        "step_sec": detector.step_sec,
        "backend": detector.model_backend,
        "labels": detector.labels,
        "events": events,
    }
