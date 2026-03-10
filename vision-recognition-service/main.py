# -*- coding: utf-8 -*-
"""
人脸识别 + 实时异常检测服务（FastAPI）
- /health
- /embed
- /verify
- /anomaly/frame  (30fps, 8s窗口, 2s步进, enter/exit/min_dur 事件)

异常检测支持双后端：
- ONNXRuntime（.onnx）
- PyTorch（.pt/.pth/.ckpt）
"""

from fastapi import FastAPI, File, UploadFile, Form
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import numpy as np
import cv2
from insightface.app import FaceAnalysis
from collections import deque, defaultdict
import importlib
import os
import time

try:
    import onnxruntime as ort
except Exception:
    ort = None

try:
    import torch
except Exception:
    torch = None

try:
    import mediapipe as mp
except Exception:
    mp = None

app = FastAPI(title="FaceSvc", version="1.3.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], allow_methods=["*"], allow_headers=["*"]
)

face_app = FaceAnalysis(name="buffalo_l", providers=["CPUExecutionProvider"])
face_app.prepare(ctx_id=0, det_size=(640, 640))


def imread_bgr(data: bytes):
    arr = np.frombuffer(data, np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("image decode failed")
    return img


def _safe_softmax(logits: np.ndarray) -> np.ndarray:
    z = logits - np.max(logits)
    e = np.exp(z)
    return e / (np.sum(e) + 1e-8)


def _import_class_by_path(path: str):
    # path 形如: pkg.module:ClassName
    mod_path, cls_name = path.split(":", 1)
    mod = importlib.import_module(mod_path)
    return getattr(mod, cls_name)


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
    faces.sort(key=lambda f: float(f.det_score), reverse=True)
    f = faces[0]
    x1, y1, x2, y2 = [int(v) for v in f.bbox]
    w, h = x2 - x1, y2 - y1
    return {
        "ok": True,
        "face_count": len(faces),
        "embedding": f.normed_embedding.tolist(),
        "det": float(f.det_score),
        "bbox": [x1, y1, x2, y2],
        "size": {"w": int(w), "h": int(h)}
    }


class VerifyResp(BaseModel):
    ok: bool
    score: float
    threshold: float


@app.post("/verify", response_model=VerifyResp)
async def verify(
    file: UploadFile = File(...),
    target: str = Form(...),
    threshold: float = Form(0.35)
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
    faces.sort(key=lambda f: float(f.det_score), reverse=True)
    curr = faces[0].normed_embedding
    tgt = np.array(np.fromstring(target.strip("[]"), sep=","), dtype=np.float32)
    if tgt.shape != curr.shape:
        return VerifyResp(ok=False, score=0.0, threshold=threshold)
    score = float(np.dot(curr, tgt))
    return VerifyResp(ok=(score >= threshold), score=score, threshold=threshold)


class OnlineAnomalyDetector:
    def __init__(self):
        self.fps = int(os.getenv("ANOMALY_FPS", "30"))
        self.win_sec = int(os.getenv("ANOMALY_WINDOW_SEC", "8"))
        self.step_sec = int(os.getenv("ANOMALY_STEP_SEC", "2"))
        self.min_dur_ms = int(os.getenv("ANOMALY_MIN_DUR_MS", "2000"))
        self.enter_th = float(os.getenv("ANOMALY_ENTER_TH", "0.65"))
        self.exit_th = float(os.getenv("ANOMALY_EXIT_TH", "0.45"))
        self.window_size = self.fps * self.win_sec
        self.step_size = self.fps * self.step_sec

        self.buffers = defaultdict(lambda: deque(maxlen=self.window_size))
        self.counts = defaultdict(int)
        self.states = {}

        self.mp_ctx = None
        if mp is not None:
            self.mp_ctx = {
                "face": mp.solutions.face_mesh.FaceMesh(static_image_mode=False, max_num_faces=1),
                "pose": mp.solutions.pose.Pose(static_image_mode=False),
                "seg": mp.solutions.selfie_segmentation.SelfieSegmentation(model_selection=1),
            }

        self.model_backend = "rule"
        self.onnx_sess = None
        self.onnx_input_name = None
        self.torch_model = None
        self.torch_device = "cpu"

        # auto | onnx | torch
        backend = os.getenv("ANOMALY_MODEL_BACKEND", "auto").strip().lower()
        model_path = os.getenv("ANOMALY_MODEL_PATH", "")
        if not model_path:
            model_path = os.getenv("ANOMALY_ONNX_PATH", "best.onnx")

        if backend in ("auto", "onnx"):
            self._try_load_onnx(model_path)
            if self.onnx_sess is not None:
                self.model_backend = "onnx"

        if self.model_backend == "rule" and backend in ("auto", "torch"):
            self._try_load_torch(model_path)
            if self.torch_model is not None:
                self.model_backend = "torch"
        labels_raw = os.getenv("ANOMALY_LABELS", "").strip()
        self.class_labels = []
        if labels_raw:
            self.class_labels = [x.strip() for x in labels_raw.split(",") if x.strip()]
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
        except Exception:
            self.onnx_sess = None
            self.onnx_input_name = None

    def _try_load_torch(self, model_path: str):
        if torch is None:
            return
        if not os.path.exists(model_path):
            return

        try:
            # 1) 尝试 TorchScript
            jit_model = torch.jit.load(model_path, map_location=self.torch_device)
            jit_model.eval()
            self.torch_model = jit_model
            return
        except Exception:
            pass

        # 2) 尝试原生 torch.load
        try:
            obj = torch.load(model_path, map_location=self.torch_device)
        except Exception:
            return

        try:
            # 2.1 直接是模型对象
            if hasattr(obj, "eval") and callable(obj.eval):
                obj.eval()
                self.torch_model = obj
                return

            # 2.2 state_dict / ckpt
            state_dict = None
            if isinstance(obj, dict) and "state_dict" in obj and isinstance(obj["state_dict"], dict):
                state_dict = obj["state_dict"]
            elif isinstance(obj, dict) and all(isinstance(v, torch.Tensor) for v in obj.values()):
                state_dict = obj

            if state_dict is None:
                return

            # 通过环境变量注入模型类（可落地）
            # 例如: ANOMALY_TORCH_CLASS_PATH=my_pkg.models.ms_tcn:Model
            class_path = os.getenv("ANOMALY_TORCH_CLASS_PATH", "").strip()
            if not class_path:
                return

            cls = _import_class_by_path(class_path)
            kwargs_raw = os.getenv("ANOMALY_TORCH_CLASS_KWARGS", "")
            kwargs = {}
            if kwargs_raw:
                # 格式: k1=v1,k2=v2（简单解析）
                for kv in kwargs_raw.split(","):
                    if "=" not in kv:
                        continue
                    k, v = kv.split("=", 1)
                    kwargs[k.strip()] = eval(v.strip())
            model = cls(**kwargs)

            # 兼容 lightning checkpoint 的 "model." 前缀
            if any(k.startswith("model.") for k in state_dict.keys()):
                state_dict = {k.replace("model.", "", 1): v for k, v in state_dict.items()}

            model.load_state_dict(state_dict, strict=False)
            model.eval()
            self.torch_model = model
        except Exception:
            self.torch_model = None

    def extract_feature(self, bgr):
        rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
        if self.mp_ctx is None:
            gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
            return np.array([
                float(gray.mean() / 255.0),
                float(gray.std() / 255.0),
                0.0, 0.0, 0.0, 0.0
            ], dtype=np.float32)

        face_res = self.mp_ctx["face"].process(rgb)
        pose_res = self.mp_ctx["pose"].process(rgb)
        seg_res = self.mp_ctx["seg"].process(rgb)

        face_present = 1.0 if face_res.multi_face_landmarks else 0.0
        pose_present = 1.0 if pose_res.pose_landmarks else 0.0

        yaw_proxy = 0.0
        if face_res.multi_face_landmarks:
            lm = face_res.multi_face_landmarks[0].landmark
            left = lm[33].x
            right = lm[263].x
            nose = lm[1].x
            center = (left + right) / 2.0
            yaw_proxy = float(abs(nose - center))

        body_area = 0.0
        if seg_res.segmentation_mask is not None:
            body_area = float((seg_res.segmentation_mask > 0.5).mean())

        hand_up = 0.0
        if pose_res.pose_landmarks:
            p = pose_res.pose_landmarks.landmark
            lw, rw = p[15], p[16]
            ls, rs = p[11], p[12]
            hand_up = 1.0 if (lw.y < ls.y or rw.y < rs.y) else 0.0

        return np.array([
            face_present,
            pose_present,
            yaw_proxy,
            body_area,
            hand_up,
            float(rgb.mean() / 255.0),
        ], dtype=np.float32)

    def _infer_onnx(self, feats_np):
        if self.onnx_sess is None:
            return None
        x = feats_np[np.newaxis, ...].astype(np.float32)  # [1,T,F]
        y = self.onnx_sess.run(None, {self.onnx_input_name: x})[0]
        logits = y[0, -1] if y.ndim == 3 else y[0]
        probs = _safe_softmax(np.asarray(logits, dtype=np.float32))
        cls = int(np.argmax(probs))
        score = float(np.max(probs))
        label = self._class_to_label(cls)
        return label, score

    def _infer_torch(self, feats_np):
        if self.torch_model is None or torch is None:
            return None
        with torch.no_grad():
            x = torch.from_numpy(feats_np).float().unsqueeze(0)  # [1,T,F]
            y = self.torch_model(x)
            if isinstance(y, (tuple, list)):
                y = y[0]
            y = y.detach().cpu().numpy()
        logits = y[0, -1] if y.ndim == 3 else y[0]
        probs = _safe_softmax(np.asarray(logits, dtype=np.float32))
        cls = int(np.argmax(probs))
        score = float(np.max(probs))
        label = self._class_to_label(cls)
        return label, score

    def _class_to_label(self, cls: int) -> str:
        if cls == 0:
            return "normal"
        idx = cls - 1
        if 0 <= idx < len(self.class_labels):
            return self.class_labels[idx]
        return f"abnormal_{cls}"

    def infer_window(self, feats_np):
        # feats_np: [T,F]
        try:
            if self.model_backend == "onnx":
                out = self._infer_onnx(feats_np)
                if out is not None:
                    return out
            elif self.model_backend == "torch":
                out = self._infer_torch(feats_np)
                if out is not None:
                    return out
        except Exception:
            pass

        # 降级规则（无模型）
        yaw = feats_np[:, 2].mean()
        hand = feats_np[:, 4].mean()
        face = feats_np[:, 0].mean()
        score = float(min(1.0, max(yaw * 2.2, hand * 0.9, (0.7 - face))))
        label = "normal" if score < 0.5 else "abnormal_posture"
        return label, score

    def update(self, room_id: int, student_id: int, ts_ms: int, bgr):
        key = f"{room_id}:{student_id}"
        feat = self.extract_feature(bgr)
        buf = self.buffers[key]
        buf.append(feat)
        self.counts[key] += 1

        if len(buf) < self.window_size:
            return []
        if self.counts[key] % self.step_size != 0:
            return []

        feats_np = np.stack(list(buf), axis=0)
        label, score = self.infer_window(feats_np)
        now = ts_ms or int(time.time() * 1000)

        st = self.states.get(key, {"active": False, "label": None, "enter_ts": None})
        events = []

        if label != "normal" and score >= self.enter_th and not st["active"]:
            st.update({"active": True, "label": label, "enter_ts": now})
            events.append({
                "type": "enter",
                "label": label,
                "ts_ms": now,
                "score": round(score, 6),
                "min_dur_ms": self.min_dur_ms,
            })
        elif st["active"] and (label == "normal" or score <= self.exit_th):
            enter_ts = st.get("enter_ts") or now
            dur = max(0, now - enter_ts)
            events.append({
                "type": "exit",
                "label": st.get("label") or "abnormal",
                "ts_ms": now,
                "score": round(score, 6),
                "duration_ms": dur,
                "min_dur_ms": self.min_dur_ms,
            })
            st = {"active": False, "label": None, "enter_ts": None}

        self.states[key] = st
        return events


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
        "fps": detector.fps,
        "window_sec": detector.win_sec,
        "step_sec": detector.step_sec,
        "backend": detector.model_backend,
        "events": events,
    }