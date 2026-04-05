# -*- coding: utf-8 -*-
"""
人脸识别 + 实时异常检测服务（FastAPI）


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
from logging.handlers import RotatingFileHandler
import os
import tempfile
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


def configure_service_logger():
    logger = logging.getLogger("vision-recognition-service")
    if logger.handlers:
        return logger

    log_dir = os.getenv("VISION_LOG_DIR", os.path.join(os.path.dirname(__file__), "logs"))
    log_file = os.getenv("VISION_LOG_FILE", os.path.join(log_dir, "vision-recognition-service.txt"))
    max_bytes = int(os.getenv("VISION_LOG_MAX_BYTES", str(20 * 1024 * 1024)))
    backup_count = int(os.getenv("VISION_LOG_BACKUP_COUNT", "10"))
    os.makedirs(log_dir, exist_ok=True)

    logger.setLevel(logging.INFO)
    formatter = logging.Formatter("%(asctime)s %(levelname)s [%(name)s] %(message)s")

    console_handler = logging.StreamHandler()
    console_handler.setFormatter(formatter)

    file_handler = RotatingFileHandler(
        log_file,
        maxBytes=max_bytes,
        backupCount=backup_count,
        encoding="utf-8",
    )
    file_handler.setFormatter(formatter)

    logger.addHandler(console_handler)
    logger.addHandler(file_handler)
    logger.propagate = False
    logger.info("vision logger ready: file=%s maxBytes=%s backupCount=%s", log_file, max_bytes, backup_count)
    return logger


log = configure_service_logger()

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
    # 所有上传文件先在这里统一解码成 OpenCV 的 BGR 图像，后续接口复用同一入口。
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
    # 注册照或核验照都会先经过这个接口提取 embedding，返回值尽量保持后端易消费。
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

    # 如果画面里出现多张脸，后端当前只取检测分数最高的那一张作为主人脸。
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
    # 这里做的是最轻量的 1:1 相似度比较，复杂的账号状态和阈值策略仍由 Java 后端控制。
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

    # insightface 给出的 embedding 已归一化，所以这里直接做点积就等价于余弦相似度。
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
        self.chunk_buffers = defaultdict(deque)
        self.chunk_last_eval_ts = {}
        self.chunk_smoothed_probs = {}
        self.chunk_states = defaultdict(dict)
        self.chunk_decode_fps = max(4, int(os.getenv("ANOMALY_CHUNK_DECODE_FPS", "12")))
        self.chunk_log_enabled = os.getenv("ANOMALY_DEBUG_CHUNK_LOG", "1").strip().lower() not in ("0", "false", "no", "off")
        self.chunk_skip_log_interval_ms = int(os.getenv("ANOMALY_CHUNK_SKIP_LOG_INTERVAL_MS", "4000"))
        self.chunk_last_skip_log = {}

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
        # 线上标签数必须和模型输出维度对齐，否则后端记录的异常名称会错位。
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
        # 推理优先使用真实模型；只有模型未加载或推理异常时才回退到规则近似分数。
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
        # 只保留最近两个窗口附近的数据，足够支持重采样和滑窗推理即可。
        keep_after = now_ms - max(self.window_ms * 2, self.window_ms + self.step_ms * 2)
        while buf and buf[0][0] < keep_after:
            buf.popleft()

    def _build_events(self, key: str, now_ms: int, probs: np.ndarray, state_store=None) -> list[dict]:
        store = self.states if state_store is None else state_store
        per_label_states = store[key]
        events = []

        for idx, label in enumerate(self.labels):
            rule = self.class_rules[label]
            prob = float(probs[idx]) if idx < len(probs) else 0.0
            state = per_label_states.get(label, {"active": False, "enter_ts": 0, "peak_score": 0.0})

            # enter / exit 按标签分别维护状态，这样学生可以同时触发多种异常而不互相覆盖。
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
                    # 只有持续时间达标才真正产出 exit 事件，避免瞬时抖动造成大量误报。
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

        store[key] = per_label_states
        return events

    def _emit_events_from_samples(
        self,
        key: str,
        now_ms: int,
        window_samples: list[tuple[int, np.ndarray]],
        last_eval_store: dict,
        smoothed_store: dict,
        state_store,
    ) -> list[dict]:
        feats_np = resample_features_by_time(window_samples, self.target_len)
        raw_probs = self.infer_window(feats_np)
        prev_probs = smoothed_store.get(key)
        if prev_probs is None:
            smoothed = raw_probs
        else:
            smoothed = self.smooth_alpha * raw_probs + (1.0 - self.smooth_alpha) * prev_probs
        smoothed_store[key] = smoothed
        last_eval_store[key] = now_ms
        return self._build_events(key, now_ms, smoothed, state_store)

    def _prune_chunk_buffer(self, buf: deque, now_ms: int):
        keep_after = now_ms - max(self.window_ms * 2, self.window_ms + self.step_ms * 2)
        kept = [item for item in buf if item["end_ts_ms"] >= keep_after]
        buf.clear()
        buf.extend(
            sorted(
                kept,
                key=lambda item: (item["start_ts_ms"], item["end_ts_ms"], item.get("chunk_id") or ""),
            )
        )

    def _log_chunk_skip(self, chunk_key: str, now_ms: int, reason: str, **kwargs):
        if not self.chunk_log_enabled:
            return
        skip_key = f"{chunk_key}:{reason}"
        last_at = int(self.chunk_last_skip_log.get(skip_key, 0))
        if now_ms - last_at < self.chunk_skip_log_interval_ms:
            return
        self.chunk_last_skip_log[skip_key] = now_ms
        log.info("anomaly chunk waiting: key=%s reason=%s extra=%s", chunk_key, reason, kwargs)

    def _decode_chunk_window_samples(self, window_chunks: list[dict]) -> list[tuple[int, np.ndarray]]:
        if not window_chunks:
            return []

        ordered = sorted(
            window_chunks,
            key=lambda item: (item["start_ts_ms"], item["end_ts_ms"], item.get("chunk_id") or ""),
        )
        stream_start = int(ordered[0]["start_ts_ms"])
        stream_end = int(max(item["end_ts_ms"] for item in ordered))
        tmp_path = None
        cap = None
        try:
            with tempfile.NamedTemporaryFile(delete=False, suffix=".webm") as tmp:
                for chunk in ordered:
                    tmp.write(chunk["bytes"])
                tmp_path = tmp.name

            cap = cv2.VideoCapture(tmp_path)
            if not cap.isOpened():
                if self.chunk_log_enabled:
                    log.warning(
                        "anomaly chunk decode failed: reason=open_failed chunkCount=%s spanMs=%s",
                        len(ordered),
                        stream_end - stream_start,
                    )
                return []

            src_fps = float(cap.get(cv2.CAP_PROP_FPS) or 0.0)
            stride = 1
            if src_fps > 1.0 and self.chunk_decode_fps > 0:
                stride = max(1, int(round(src_fps / float(self.chunk_decode_fps))))

            temporal_state = {}
            raw_positions = []
            feats = []
            frame_idx = 0
            while True:
                ok, frame = cap.read()
                if not ok:
                    break
                keep = stride <= 1 or frame_idx % stride == 0
                if keep:
                    feats.append(self.feature_extractor.extract(frame, temporal_state))
                    raw_positions.append(float(cap.get(cv2.CAP_PROP_POS_MSEC) or 0.0))
                frame_idx += 1

            if not feats:
                if self.chunk_log_enabled:
                    log.info(
                        "anomaly chunk decode empty: chunkCount=%s stride=%s srcFps=%.3f",
                        len(ordered),
                        stride,
                        src_fps,
                    )
                return []

            if self.chunk_log_enabled:
                log.info(
                    "anomaly chunk decoded: chunkCount=%s sampleCount=%s srcFps=%.3f stride=%s spanMs=%s",
                    len(ordered),
                    len(feats),
                    src_fps,
                    stride,
                    stream_end - stream_start,
                )

            raw_positions_np = np.asarray(raw_positions, dtype=np.float32)
            if (
                raw_positions_np.size > 1
                and np.isfinite(raw_positions_np).all()
                and float(raw_positions_np[-1] - raw_positions_np[0]) > 1.0
            ):
                raw_positions_np = raw_positions_np - raw_positions_np[0]
                raw_span = float(raw_positions_np[-1])
                mapped_ts = stream_start + (raw_positions_np / max(raw_span, 1e-6)) * max(1.0, stream_end - stream_start)
            else:
                mapped_ts = np.linspace(stream_start, stream_end, num=len(feats), endpoint=True, dtype=np.float32)

            return [
                (int(round(float(mapped_ts[idx]))), np.asarray(feats[idx], dtype=np.float32))
                for idx in range(len(feats))
            ]
        finally:
            if cap is not None:
                cap.release()
            if tmp_path and os.path.exists(tmp_path):
                try:
                    os.remove(tmp_path)
                except OSError:
                    pass

    def update(self, room_id: int, student_id: int, ts_ms: int, bgr: np.ndarray) -> list[dict]:
        now_ms = ts_ms or int(time.time() * 1000)
        key = f"{room_id}:{student_id}"

        # 每次上传先抽一帧特征放进时间序列，再看是否已经积累到足以推理的一个窗口。
        temporal_state = self.feature_states[key]
        feat = self.feature_extractor.extract(bgr, temporal_state)

        buf = self.buffers[key]
        buf.append((now_ms, feat))
        self._prune_buffer(buf, now_ms)

        last_eval = self.last_eval_ts.get(key, 0)
        if now_ms - last_eval < self.step_ms:
            # 没到步进间隔时只缓存样本，不触发推理；这样同一窗口不会被过于频繁地重复计算。
            return []

        window_start = now_ms - self.window_ms
        window_samples = [(ts, item) for ts, item in buf if ts >= window_start]
        if len(window_samples) < self.min_required_samples:
            # 样本量太少时，即使硬推理也不可靠，所以宁可返回空事件等待后续更多帧。
            return []

        span_ms = window_samples[-1][0] - window_samples[0][0]
        if span_ms < int(self.window_ms * 0.9):
            # 即使样本数量够多，如果时间跨度不够 8 秒左右，也说明窗口内容仍不完整。
            return []

        # 先做时间重采样，再做模型推理，最后对概率做平滑，尽量减少浏览器上传抖动带来的误报。
        return self._emit_events_from_samples(
            key,
            now_ms,
            window_samples,
            self.last_eval_ts,
            self.smoothed_probs,
            self.states,
        )

    def update_chunk(
        self,
        room_id: int,
        student_id: int,
        chunk_start_ts_ms: int,
        chunk_end_ts_ms: int,
        video_bytes: bytes,
        chunk_id: str | None = None,
    ) -> list[dict]:
        now_ms = int(chunk_end_ts_ms or time.time() * 1000)
        start_ms = int(chunk_start_ts_ms or max(0, now_ms - 1000))
        key = f"{room_id}:{student_id}"
        chunk_key = f"chunk:{key}"

        buf = self.chunk_buffers[key]
        if chunk_id and any(item.get("chunk_id") == chunk_id for item in buf):
            if self.chunk_log_enabled:
                log.info("anomaly chunk ignored duplicate: key=%s chunkId=%s", chunk_key, chunk_id)
            return []

        buf.append({
            "chunk_id": chunk_id or "",
            "start_ts_ms": start_ms,
            "end_ts_ms": now_ms,
            "bytes": video_bytes,
        })
        ordered_buf = sorted(
            buf,
            key=lambda item: (item["start_ts_ms"], item["end_ts_ms"], item.get("chunk_id") or ""),
        )
        buf.clear()
        buf.extend(ordered_buf)
        self._prune_chunk_buffer(buf, now_ms)
        if self.chunk_log_enabled:
            log.info(
                "anomaly chunk received: key=%s chunkId=%s bytes=%s startTsMs=%s endTsMs=%s bufferChunks=%s",
                chunk_key,
                chunk_id or "",
                len(video_bytes),
                start_ms,
                now_ms,
                len(buf),
            )

        anchor_ms = max(int(item["end_ts_ms"]) for item in buf)
        last_eval = self.chunk_last_eval_ts.get(chunk_key, 0)
        late_fill_current_window = now_ms < last_eval and anchor_ms >= last_eval
        if anchor_ms - last_eval < self.step_ms and not late_fill_current_window:
            self._log_chunk_skip(chunk_key, anchor_ms, "wait_step", last_eval=last_eval, anchor_ms=anchor_ms)
            return []

        window_start = anchor_ms - self.window_ms
        window_chunks = [item for item in buf if item["end_ts_ms"] >= window_start and item["start_ts_ms"] <= anchor_ms]
        if not window_chunks:
            self._log_chunk_skip(chunk_key, anchor_ms, "no_window_chunks", anchor_ms=anchor_ms)
            return []

        span_start = min(int(item["start_ts_ms"]) for item in window_chunks)
        span_end = max(int(item["end_ts_ms"]) for item in window_chunks)
        span_ms = span_end - span_start
        if span_ms < int(self.window_ms * 0.9):
            self._log_chunk_skip(
                chunk_key,
                anchor_ms,
                "window_span_short",
                span_ms=span_ms,
                required_ms=int(self.window_ms * 0.9),
                chunk_count=len(window_chunks),
            )
            return []

        window_samples = self._decode_chunk_window_samples(window_chunks)
        if len(window_samples) < self.min_required_samples:
            self._log_chunk_skip(
                chunk_key,
                anchor_ms,
                "sample_count_short",
                sample_count=len(window_samples),
                required_samples=self.min_required_samples,
            )
            return []

        events = self._emit_events_from_samples(
            chunk_key,
            anchor_ms,
            window_samples,
            self.chunk_last_eval_ts,
            self.chunk_smoothed_probs,
            self.chunk_states,
        )
        if self.chunk_log_enabled:
            log.info(
                "anomaly chunk infer finished: key=%s chunkId=%s sampleCount=%s eventCount=%s labels=%s anchorMs=%s",
                chunk_key,
                chunk_id or "",
                len(window_samples),
                len(events),
                ",".join(str(item.get("label", "unknown")) for item in events) if events else "",
                anchor_ms,
            )
        return events


detector = OnlineAnomalyDetector()


@app.post("/anomaly/frame")
async def anomaly_frame(
    file: UploadFile = File(...),
    room_id: int = Form(...),
    student_id: int = Form(...),
    ts_ms: int = Form(0),
):
    # Java 后端会以固定节奏调用这个接口；这里只负责返回检测结果，不做持久化和业务判断。
    img = imread_bgr(await file.read())
    # detector 会按 room_id + student_id 为每个学生维护独立缓存，不会把不同学生的状态混在一起。
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


@app.post("/anomaly/chunk")
async def anomaly_chunk(
    file: UploadFile = File(...),
    room_id: int = Form(...),
    student_id: int = Form(...),
    chunk_start_ts_ms: int = Form(0),
    chunk_end_ts_ms: int = Form(0),
    chunk_id: str = Form(""),
):
    video_bytes = await file.read()
    events = detector.update_chunk(
        room_id,
        student_id,
        chunk_start_ts_ms,
        chunk_end_ts_ms,
        video_bytes,
        chunk_id or None,
    )
    return {
        "ok": True,
        "fps": detector.target_fps,
        "window_sec": detector.win_sec,
        "step_sec": detector.step_sec,
        "backend": detector.model_backend,
        "labels": detector.labels,
        "events": events,
    }
