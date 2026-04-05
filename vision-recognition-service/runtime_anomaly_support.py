"""
runtime_anomaly_support 汇总实时异常检测需要的标签规则、特征提取、重采样和模型加载辅助逻辑。
"""
from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

import cv2
import numpy as np

try:
    import mediapipe as mp
except Exception:
    mp = None

try:
    import torch
    import torch.nn as nn
except Exception:
    torch = None
    nn = None


# 训练数据中的类别顺序，线上必须与权重文件保持一致。
DEFAULT_LABELS = [
    "look_left",
    "look_right",
    "look_down",
    "look_offscreen",
    "face_not_visible",
    "talking",
    "other_person_present",
    "other_limb_present",
    "multi_face",
    "leave_seat",
]


# 直接沿用训练配置里的最小时长，避免线上与离线评估口径不一致。
DEFAULT_MIN_DUR_SEC = {
    "look_left": 0.3,
    "look_right": 0.3,
    "look_down": 0.3,
    "look_offscreen": 0.3,
    "face_not_visible": 0.7,
    "talking": 0.3,
    "other_person_present": 0.3,
    "other_limb_present": 0.3,
    "multi_face": 0.3,
    "leave_seat": 3.0,
}


@dataclass(frozen=True)
class ClassRule:
    # 每个异常标签都独立维护进入阈值、退出阈值和最小时长，避免全部标签共用同一硬编码。
    enter_th: float
    exit_th: float
    min_dur_ms: int


def choose_anomaly_model_path(explicit_path: str | None = None) -> str:
    """
    优先使用训练产出的 ckpt，其次使用只包含 state_dict 的 pth。
    ONNX 放在最后，避免误用未加载权重的导出文件。
    """
    if explicit_path:
        return explicit_path

    for candidate in ("best.ckpt", "best_state.pth", "best.onnx"):
        if Path(candidate).exists():
            return candidate
    return "best.ckpt"


def parse_labels(labels_raw: str | None, expected_count: int | None = None) -> list[str]:
    # 标签既可以来自环境变量，也可以根据模型输出维度回退到默认顺序。
    if labels_raw:
        parsed = [item.strip() for item in labels_raw.split(",") if item.strip()]
    else:
        parsed = list(DEFAULT_LABELS)

    if expected_count is None:
        return parsed

    if len(parsed) == expected_count:
        return parsed

    if expected_count <= len(DEFAULT_LABELS):
        return list(DEFAULT_LABELS[:expected_count])

    padded = list(parsed[:expected_count])
    while len(padded) < expected_count:
        padded.append(f"abnormal_{len(padded)}")
    return padded


def build_class_rules(labels: list[str], default_enter: float, default_exit: float) -> dict[str, ClassRule]:
    rules: dict[str, ClassRule] = {}
    for label in labels:
        # 最小时长允许通过环境变量单独覆盖，便于线上按类别调优而不重训模型。
        env_key = f"ANOMALY_MIN_DUR_MS_{label.upper()}"
        min_dur_ms = int(round(DEFAULT_MIN_DUR_SEC.get(label, 0.3) * 1000))
        min_dur_ms = int(os.getenv(env_key, str(min_dur_ms)))
        rules[label] = ClassRule(
            enter_th=default_enter,
            exit_th=default_exit,
            min_dur_ms=max(100, min_dur_ms),
        )
    return rules


def sigmoid_np(x: np.ndarray) -> np.ndarray:
    x = np.asarray(x, dtype=np.float32)
    return 1.0 / (1.0 + np.exp(-x))


def resample_features_by_time(samples: list[tuple[int, np.ndarray]], target_len: int) -> np.ndarray:
    """
    按时间戳把不规则采样的特征重采样为固定长度序列。
    浏览器上传帧存在抖动时，这一步能保证模型仍然看到稳定的 8 秒输入。
    """
    if not samples:
        raise ValueError("empty samples")

    ordered = sorted(samples, key=lambda item: item[0])
    ts = np.array([float(item[0]) for item in ordered], dtype=np.float32)
    feats = np.stack([np.asarray(item[1], dtype=np.float32) for item in ordered], axis=0)

    # np.interp 要求 x 单调递增；重复时间戳时只保留第一条。
    uniq_mask = np.ones(len(ts), dtype=bool)
    if len(ts) > 1:
        uniq_mask[1:] = np.diff(ts) > 1e-6
    ts = ts[uniq_mask]
    feats = feats[uniq_mask]

    if len(ts) == 1:
        return np.repeat(feats, target_len, axis=0)

    target_ts = np.linspace(ts[0], ts[-1], num=target_len, endpoint=True, dtype=np.float32)
    out = np.empty((target_len, feats.shape[1]), dtype=np.float32)
    for col in range(feats.shape[1]):
        out[:, col] = np.interp(target_ts, ts, feats[:, col]).astype(np.float32)
    return out


def extract_torch_checkpoint_meta(ckpt_obj) -> tuple[dict, int | None, int | None]:
    """
    支持 lightning ckpt、纯 state_dict、普通 checkpoint 三种格式。
    """
    in_dim = None
    n_classes = None

    if isinstance(ckpt_obj, dict) and isinstance(ckpt_obj.get("hyper_parameters"), dict):
        hp = ckpt_obj["hyper_parameters"]
        in_dim = hp.get("in_dim")
        n_classes = hp.get("n_classes")

    if isinstance(ckpt_obj, dict) and isinstance(ckpt_obj.get("state_dict"), dict):
        raw_state = ckpt_obj["state_dict"]
    elif isinstance(ckpt_obj, dict) and all(hasattr(v, "shape") for v in ckpt_obj.values()):
        raw_state = ckpt_obj
    else:
        raw_state = {}

    state_dict = {}
    for key, value in raw_state.items():
        if key.startswith("model."):
            norm_key = key.replace("model.", "", 1)
        else:
            norm_key = key

        # 训练侧的 Transformer 编码器命名是 `tf.*`。线上曾改成
        # `transformer.*`，这里统一回训练命名，兼容历史镜像和权重文件。
        if norm_key.startswith("transformer."):
            norm_key = norm_key.replace("transformer.", "tf.", 1)

        state_dict[norm_key] = value
    return state_dict, in_dim, n_classes


class RuntimeFeatureExtractor:
    """
    线上特征提取逻辑，尽量对齐训练时 feature_extract.py 的 24 维定义。
    MediaPipe 模型实例是共享的；prev_gray / prev_pose 等时序状态按学生分别维护。
    """

    def __init__(self):
        self.face_detector = None
        self.face_mesh = None
        self.pose = None
        self.segmentation = None
        self.init_error = None

        if mp is None:
            self.init_error = "mediapipe import failed"
            return

        if not hasattr(mp, "solutions"):
            version = getattr(mp, "__version__", "unknown")
            self.init_error = f"mediapipe {version} does not expose mp.solutions"
            return

        try:
            self.face_detector = mp.solutions.face_detection.FaceDetection(
                model_selection=1,
                min_detection_confidence=0.5,
            )
        except Exception:
            self.face_detector = None

        try:
            self.face_mesh = mp.solutions.face_mesh.FaceMesh(
                static_image_mode=False,
                max_num_faces=1,
                refine_landmarks=True,
                min_detection_confidence=0.5,
                min_tracking_confidence=0.5,
            )
        except Exception:
            self.face_mesh = None

        try:
            self.pose = mp.solutions.pose.Pose(
                static_image_mode=False,
                model_complexity=1,
                min_detection_confidence=0.5,
                min_tracking_confidence=0.5,
            )
        except Exception:
            self.pose = None

        try:
            self.segmentation = mp.solutions.selfie_segmentation.SelfieSegmentation(model_selection=1)
        except Exception:
            self.segmentation = None

        if all(component is None for component in (self.face_detector, self.face_mesh, self.pose, self.segmentation)):
            version = getattr(mp, "__version__", "unknown")
            self.init_error = f"mediapipe {version} initialized but no vision solution backend is available"

    @staticmethod
    def _letterbox_square(bgr: np.ndarray, dst_size: int = 256) -> np.ndarray:
        h, w = bgr.shape[:2]
        scale = dst_size / max(h, w)
        nh, nw = int(round(h * scale)), int(round(w * scale))
        resized = cv2.resize(bgr, (nw, nh), interpolation=cv2.INTER_AREA)
        out = np.zeros((dst_size, dst_size, 3), dtype=bgr.dtype)
        top = (dst_size - nh) // 2
        left = (dst_size - nw) // 2
        out[top:top + nh, left:left + nw] = resized
        return out

    def extract(self, frame_bgr: np.ndarray, temporal_state: dict) -> np.ndarray:
        # 这里返回的 24 维特征需要尽量贴近离线训练口径，否则线上模型效果会明显漂移。
        if self.init_error:
            raise RuntimeError(self.init_error)

        square_bgr = self._letterbox_square(frame_bgr, dst_size=256)
        rgb = cv2.cvtColor(square_bgr, cv2.COLOR_BGR2RGB)
        gray = cv2.cvtColor(square_bgr, cv2.COLOR_BGR2GRAY)
        height, width = gray.shape[:2]

        mean = gray.mean() / 255.0
        std = gray.std() / 255.0
        lap = cv2.Laplacian(gray, cv2.CV_64F).var() / 1000.0

        motion = 0.0
        hist_sim = 1.0
        prev_gray = temporal_state.get("prev_gray")
        if prev_gray is not None:
            diff = cv2.absdiff(gray, prev_gray)
            motion = float(diff.mean()) / 255.0
            h1 = cv2.calcHist([gray], [0], None, [32], [0, 256])
            h2 = cv2.calcHist([prev_gray], [0], None, [32], [0, 256])
            cv2.normalize(h1, h1)
            cv2.normalize(h2, h2)
            hist_sim = float(cv2.compareHist(h1, h2, cv2.HISTCMP_CORREL))
        temporal_state["prev_gray"] = gray

        yaw = pitch = roll = 0.0
        dyaw = dpitch = droll = 0.0
        face_quality = 0.0
        liveness_score = 0.0
        face_ohe = [1.0, 0.0, 0.0]
        people_ohe = [1.0, 0.0, 0.0]
        torso_vis = 0.0
        other_area_ratio = 0.0
        ear_left = 0.0
        ear_right = 0.0
        mar = 0.0
        main_box = None

        if self.face_detector is not None:
            try:
                face_det = self.face_detector.process(rgb)
                detections = face_det.detections or []
                face_count = len(detections)
                if face_count == 0:
                    face_ohe = [1.0, 0.0, 0.0]
                elif face_count == 1:
                    face_ohe = [0.0, 1.0, 0.0]
                else:
                    face_ohe = [0.0, 0.0, 1.0]

                if detections:
                    best = sorted(detections, key=lambda item: item.score[0], reverse=True)[0]
                    bb = best.location_data.relative_bounding_box
                    x1 = max(0, int(bb.xmin * width))
                    y1 = max(0, int(bb.ymin * height))
                    x2 = min(width, int((bb.xmin + bb.width) * width))
                    y2 = min(height, int((bb.ymin + bb.height) * height))
                    if x2 > x1 and y2 > y1:
                        main_box = (x1, y1, x2, y2)
                        crop = gray[y1:y2, x1:x2]
                        if crop.size > 0:
                            face_quality = float(cv2.Laplacian(crop, cv2.CV_64F).var() / 1000.0)
            except Exception:
                pass

        if self.face_mesh is not None:
            try:
                face_mesh_res = self.face_mesh.process(rgb)
                if face_mesh_res.multi_face_landmarks:
                    lm = face_mesh_res.multi_face_landmarks[0].landmark
                    idx = {"nose": 1, "chin": 152, "eye_l": 33, "eye_r": 263, "mouth_l": 61, "mouth_r": 291}
                    pts2d = np.array([
                        [lm[idx["nose"]].x * width, lm[idx["nose"]].y * height],
                        [lm[idx["chin"]].x * width, lm[idx["chin"]].y * height],
                        [lm[idx["eye_l"]].x * width, lm[idx["eye_l"]].y * height],
                        [lm[idx["eye_r"]].x * width, lm[idx["eye_r"]].y * height],
                        [lm[idx["mouth_l"]].x * width, lm[idx["mouth_l"]].y * height],
                        [lm[idx["mouth_r"]].x * width, lm[idx["mouth_r"]].y * height],
                    ], dtype=np.float32)
                    pts3d = np.array([
                        [0.0, 0.0, 0.0],
                        [0.0, -63.6, -12.5],
                        [-43.3, 32.7, -26.0],
                        [43.3, 32.7, -26.0],
                        [-28.9, -28.9, -24.1],
                        [28.9, -28.9, -24.1],
                    ], dtype=np.float32)
                    focal = float(width)
                    cam = np.array([[focal, 0, width / 2], [0, focal, height / 2], [0, 0, 1]], dtype=np.float32)
                    dist = np.zeros((4, 1), dtype=np.float32)
                    ok, rvec, _tvec = cv2.solvePnP(pts3d, pts2d, cam, dist, flags=cv2.SOLVEPNP_ITERATIVE)
                    if ok:
                        rot, _ = cv2.Rodrigues(rvec)
                        sy = np.sqrt(rot[0, 0] ** 2 + rot[1, 0] ** 2)
                        pitch = float(np.degrees(np.arctan2(rot[2, 1], rot[2, 2])))
                        yaw = float(np.degrees(np.arctan2(-rot[2, 0], sy)))
                        roll = float(np.degrees(np.arctan2(rot[1, 0], rot[0, 0])))
                        if "prev_pose" in temporal_state:
                            pyaw, ppitch, proll = temporal_state["prev_pose"]
                            dyaw = yaw - pyaw
                            dpitch = pitch - ppitch
                            droll = roll - proll
                        temporal_state["prev_pose"] = (yaw, pitch, roll)

                    def calc_ear(landmarks, idxs):
                        pts = np.array([[landmarks[i].x * width, landmarks[i].y * height] for i in idxs], dtype=np.float32)
                        return float(
                            (np.linalg.norm(pts[1] - pts[5]) + np.linalg.norm(pts[2] - pts[4])) /
                            (2.0 * np.linalg.norm(pts[0] - pts[3]) + 1e-6)
                        )

                    ear_left = calc_ear(lm, [33, 160, 158, 133, 153, 144])
                    ear_right = calc_ear(lm, [263, 387, 385, 362, 380, 373])
                    p13 = np.array([lm[13].x * width, lm[13].y * height], dtype=np.float32)
                    p14 = np.array([lm[14].x * width, lm[14].y * height], dtype=np.float32)
                    p61 = np.array([lm[61].x * width, lm[61].y * height], dtype=np.float32)
                    p291 = np.array([lm[291].x * width, lm[291].y * height], dtype=np.float32)
                    mar = float(np.linalg.norm(p13 - p14) / (np.linalg.norm(p61 - p291) + 1e-6))

                    prev_ear_mar = temporal_state.get("prev_ear_mar")
                    if prev_ear_mar is not None:
                        ple, pre, pmar = prev_ear_mar
                        dyn = abs(ear_left - ple) + abs(ear_right - pre) + 0.5 * abs(mar - pmar)
                    else:
                        dyn = 0.0
                    temporal_state["prev_ear_mar"] = (ear_left, ear_right, mar)
                    liveness_score = float(
                        0.4 * np.clip((ear_left + ear_right) * 0.5 * 2.0, 0.0, 1.0) +
                        0.3 * np.clip(mar * 2.0, 0.0, 1.0) +
                        0.3 * np.clip((abs(dyaw) + abs(dpitch) + abs(droll) + dyn * 10.0) / 60.0, 0.0, 1.0)
                    )
            except Exception:
                pass

        if self.pose is not None:
            try:
                pose_res = self.pose.process(rgb)
                if pose_res.pose_landmarks:
                    lm = pose_res.pose_landmarks.landmark
                    torso_ids = [0, 11, 12, 23, 24]
                    torso_vis = float(np.mean([lm[idx].visibility for idx in torso_ids]))
            except Exception:
                pass

        if self.segmentation is not None:
            try:
                seg_res = self.segmentation.process(rgb)
                if seg_res.segmentation_mask is not None:
                    mask = (seg_res.segmentation_mask > 0.5).astype(np.uint8)
                    person_area = int(mask.sum())
                    if main_box is not None:
                        x1, y1, x2, y2 = main_box
                        pad = int(0.2 * max(x2 - x1, y2 - y1))
                        xa = max(0, x1 - pad)
                        ya = max(0, y1 - pad)
                        xb = min(width, x2 + pad)
                        yb = min(height, y2 + pad)
                        subject = np.zeros_like(mask)
                        subject[ya:yb, xa:xb] = 1
                        other_pixels = int((mask * (1 - subject)).sum())
                        other_area_ratio = float(other_pixels / max(1, person_area))

                    if face_ohe == [0.0, 0.0, 1.0]:
                        people_ohe = [0.0, 0.0, 1.0]
                    elif face_ohe == [0.0, 1.0, 0.0] or person_area > 0.2 * height * width:
                        people_ohe = [0.0, 1.0, 0.0]
                    else:
                        people_ohe = [1.0, 0.0, 0.0]
            except Exception:
                pass

        feat = [
            mean,
            std,
            lap,
            motion,
            hist_sim,
            yaw,
            pitch,
            roll,
            dyaw,
            dpitch,
            droll,
            face_quality,
            liveness_score,
            *face_ohe,
            *people_ohe,
            torso_vis,
            other_area_ratio,
            ear_left,
            ear_right,
            mar,
        ]
        return np.asarray(feat, dtype=np.float32)


if nn is not None:
    class SE1D(nn.Module):
        def __init__(self, channels: int, reduction: int = 8):
            super().__init__()
            hidden = max(1, channels // reduction)
            self.fc = nn.Sequential(
                nn.AdaptiveAvgPool1d(1),
                nn.Conv1d(channels, hidden, 1),
                nn.ReLU(inplace=True),
                nn.Conv1d(hidden, channels, 1),
                nn.Sigmoid(),
            )

        def forward(self, x):
            return x * self.fc(x)


    class MSBlock(nn.Module):
        def __init__(self, in_ch: int, out_ch: int, ks: int = 3, dilations=(1, 2, 4, 8), dropout: float = 0.1):
            super().__init__()
            self.branches = nn.ModuleList()
            for dilation in dilations:
                padding = (dilation * (ks - 1)) // 2
                self.branches.append(nn.Sequential(
                    nn.Conv1d(in_ch, out_ch, ks, padding=padding, dilation=dilation),
                    nn.GroupNorm(8, out_ch),
                    nn.ReLU(inplace=True),
                    nn.Dropout(dropout),
                ))
            self.merge = nn.Conv1d(out_ch * len(dilations), out_ch, 1)
            self.se = SE1D(out_ch)
            self.down = nn.Conv1d(in_ch, out_ch, 1) if in_ch != out_ch else nn.Identity()
            self.act = nn.ReLU(inplace=True)

        def forward(self, x):
            merged = torch.cat([branch(x) for branch in self.branches], dim=1)
            merged = self.merge(merged)
            merged = self.se(merged)
            return self.act(merged + self.down(x))


    class HybridSeqModel(nn.Module):
        """
        直接复用训练时的主干结构，避免线上再引入另一套推理网络。
        """

        def __init__(
            self,
            in_dim: int,
            n_classes: int,
            channels: int = 128,
            n_blocks: int = 8,
            dropout: float = 0.1,
            use_transformer: bool = True,
            d_model: int = 128,
            nhead: int = 4,
            nlayers: int = 2,
        ):
            super().__init__()
            self.stem = nn.Conv1d(in_dim, channels, 1)
            self.tcn = nn.Sequential(*[
                MSBlock(channels, channels, ks=3, dilations=(1, 2, 4, 8), dropout=dropout)
                for _ in range(n_blocks)
            ])
            self.use_transformer = use_transformer
            if use_transformer:
                self.proj_in = nn.Conv1d(channels, d_model, 1)
                encoder_layer = nn.TransformerEncoderLayer(
                    d_model=d_model,
                    nhead=nhead,
                    dim_feedforward=d_model * 4,
                    dropout=0.1,
                    batch_first=True,
                    norm_first=True,
                )
                # 与训练侧 `model_seq.py` 保持一致，确保 ckpt 中的 `tf.*`
                # 参数名能被完整加载。
                self.tf = nn.TransformerEncoder(encoder_layer, num_layers=nlayers)
                self.proj_out = nn.Conv1d(d_model, channels, 1)
            self.head = nn.Conv1d(channels, n_classes, 1)

        def forward(self, x):
            x = x.transpose(1, 2)
            h = self.stem(x)
            h = self.tcn(h)
            if self.use_transformer:
                z = self.proj_in(h).transpose(1, 2)
                z = self.tf(z)
                h = self.proj_out(z.transpose(1, 2))
            return self.head(h).transpose(1, 2)
