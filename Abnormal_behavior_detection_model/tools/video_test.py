import os
import time
import json
import collections
from dataclasses import dataclass
from typing import Deque, Dict, List, Optional, Tuple

import cv2
import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F

# =====================
# 配置（根据你的训练配置调整）
# =====================
VIDEO_PATH = r"../dataset/videos/zhufan.mp4"  # 视频文件
CKPT_PATH = r"../src/train_test_v1/runs/hseq/best_state.pth"  # PyTorch 模型权重
OUT_PATH = r""  # 留空则自动写 <视频名>_annotated.mp4
LABEL_MAP = None  # 可为 None 或 JSON 路径

# 根据你的训练配置调整
FEATURE_DIM = 24  # 根据你的权重文件，特征维度是24
NUM_CLASSES = 10  # 根据你的权重文件，类别数是10
WINDOW_SEC = 2.0  # 滑动窗口秒
TARGET_FPS = 60.0  # 推理帧率
STRIDE_SEC = 1.5  # 推理步长秒
SMOOTHING = 0.6  # 概率 EMA 平滑系数

# 设备
DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")
print(f"[设备] {DEVICE}")


# =====================
# 模型定义（完全匹配你的训练代码）
# =====================

class SE1D(nn.Module):
    """Squeeze-and-Excitation 通道注意力 - 完全匹配你的训练代码"""

    def __init__(self, ch, r=8):
        super().__init__()
        self.fc = nn.Sequential(
            nn.AdaptiveAvgPool1d(1),
            nn.Conv1d(ch, ch // r, 1),
            nn.ReLU(inplace=True),
            nn.Conv1d(ch // r, ch, 1),
            nn.Sigmoid()
        )

    def forward(self, x):  # [B,C,W]
        w = self.fc(x)
        return x * w


class MSBlock(nn.Module):
    """多尺度膨胀卷积块 - 完全匹配你的训练代码"""

    def __init__(self, in_ch, out_ch, ks=3, dilations=(1, 2, 4, 8), dropout=0.1):
        super().__init__()
        self.branches = nn.ModuleList([])

        for d in dilations:
            # 计算正确的填充以保持长度不变
            padding = (d * (ks - 1)) // 2
            branch = nn.Sequential(
                nn.Conv1d(in_ch, out_ch, ks, padding=padding, dilation=d),
                nn.GroupNorm(8, out_ch),
                nn.ReLU(inplace=True),
                nn.Dropout(dropout),
            )
            self.branches.append(branch)

        self.merge = nn.Conv1d(out_ch * len(dilations), out_ch, 1)
        self.se = SE1D(out_ch)
        self.down = nn.Conv1d(in_ch, out_ch, 1) if in_ch != out_ch else nn.Identity()
        self.act = nn.ReLU(inplace=True)

    def forward(self, x):  # [B,C,W]
        outs = [b(x) for b in self.branches]
        y = torch.cat(outs, dim=1)
        y = self.merge(y)
        y = self.se(y)
        return self.act(y + self.down(x))


class HybridSeqModel(nn.Module):
    """
    主干：MS-TCN 堆叠 + Transformer - 完全匹配你的训练代码
    """

    def __init__(self, in_dim, n_classes, channels=128, n_blocks=8, dropout=0.1,
                 use_transformer=True, d_model=128, nhead=8, nlayers=2):
        super().__init__()
        # Stem层 - 使用1x1卷积
        self.stem = nn.Conv1d(in_dim, channels, 1)

        # TCN层
        blocks = []
        for _ in range(n_blocks):
            blocks.append(MSBlock(channels, channels, ks=3, dilations=(1, 2, 4, 8), dropout=dropout))
        self.tcn = nn.Sequential(*blocks)

        # Transformer层
        self.use_tf = use_transformer
        if use_transformer:
            self.proj_in = nn.Conv1d(channels, d_model, 1)
            enc_layer = nn.TransformerEncoderLayer(
                d_model=d_model,
                nhead=nhead,
                dim_feedforward=d_model * 4,
                dropout=0.1,
                batch_first=True,
                norm_first=True
            )
            self.tf = nn.TransformerEncoder(enc_layer, num_layers=nlayers)
            self.proj_out = nn.Conv1d(d_model, channels, 1)

        # 分类头
        self.head = nn.Conv1d(channels, n_classes, 1)

    def forward(self, x):  # x: [B,W,F]
        x = x.transpose(1, 2)  # [B,F,W]
        h = self.stem(x)  # [B,C,W]
        h = self.tcn(h)  # [B,C,W]

        if self.use_tf:
            z = self.proj_in(h).transpose(1, 2)  # [B,W,D]
            z = self.tf(z)  # [B,W,D]
            h = self.proj_out(z.transpose(1, 2))  # [B,C,W]

        y = self.head(h).transpose(1, 2)  # [B,W,C]
        return y


# =====================
# 小工具
# =====================

def load_label_map(path: Optional[str]) -> Dict[int, str]:
    # 根据你的10个类别调整标签映射
    default = {
        0: "clean", 1: "yaw_large", 2: "pitch_down", 3: "face_not_visible",
        4: "other_person", 5: "suspicious_body", 6: "leave_seat",
        7: "class_7", 8: "class_8", 9: "class_9"  # 请根据实际类别名称修改
    }
    if not path:
        return default
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    if all(isinstance(k, str) for k in data.keys()):
        return {int(v): k for k, v in data.items()}
    return {int(k): str(v) for k, v in data.items()}


def default_out_path(video_path: str) -> str:
    d = os.path.dirname(video_path)
    stem = os.path.splitext(os.path.basename(video_path))[0]
    return os.path.join(d, f"{stem}_annotated.mp4")


# =====================
# 事件聚合
# =====================
@dataclass
class ClassRule:
    start_th: float
    stop_th: float
    min_dur_sec: float


class EventAggregator:
    def __init__(self, fps: float, label_map: Dict[int, str], rules: Dict[int, ClassRule]):
        self.fps = fps
        self.label_map = label_map
        self.rules = rules
        self.active_cls: Optional[int] = None
        self.active_start_f: Optional[int] = None
        self.frame_idx = 0
        self.events: List[Dict] = []

    def update(self, probs: np.ndarray) -> Optional[int]:
        self.frame_idx += 1
        if self.active_cls is not None:
            rule = self.rules.get(self.active_cls)
            if rule and probs[self.active_cls] >= rule.stop_th:
                return self.active_cls
            if rule:
                dur = (self.frame_idx - (self.active_start_f or self.frame_idx)) / max(self.fps, 1.0)
                if dur >= rule.min_dur_sec:
                    self.events.append({
                        "class_id": self.active_cls,
                        "class_name": self.label_map.get(self.active_cls, str(self.active_cls)),
                        "start_frame": int(self.active_start_f or (self.frame_idx - 1)),
                        "end_frame": int(self.frame_idx - 1),
                        "duration_sec": float(dur),
                    })
        cid = int(np.argmax(probs))
        rule = self.rules.get(cid)
        if rule and probs[cid] >= rule.start_th:
            self.active_cls = cid
            self.active_start_f = self.frame_idx
            return cid
        self.active_cls = None
        self.active_start_f = None
        return None

    def flush(self):
        if self.active_cls is None or self.active_start_f is None:
            return
        rule = self.rules.get(self.active_cls)
        dur = (self.frame_idx - self.active_start_f + 1) / max(self.fps, 1.0)
        if rule and dur >= rule.min_dur_sec:
            self.events.append({
                "class_id": self.active_cls,
                "class_name": self.label_map.get(self.active_cls, str(self.active_cls)),
                "start_frame": int(self.active_start_f),
                "end_frame": int(self.frame_idx),
                "duration_sec": float(dur),
            })


# =====================
# HUD显示
# =====================
@dataclass
class HudStyle:
    font: int = cv2.FONT_HERSHEY_SIMPLEX
    fscale: float = 0.6
    thick: int = 2
    pad: int = 8
    line: int = 18


def draw_hud(frame: np.ndarray, probs: np.ndarray, label_map: Dict[int, str], active_cls: Optional[int],
             fps_show: float):
    h, w = frame.shape[:2]
    st = HudStyle()
    x, y = st.pad, st.pad + 12
    cv2.putText(frame, f"FPS: {fps_show:.1f}", (x, y), st.font, st.fscale, (255, 255, 255), st.thick, cv2.LINE_AA)
    y += st.line
    if probs.size:
        top = np.argsort(probs)[-3:][::-1]
        for i, cid in enumerate(top, 1):
            cv2.putText(frame, f"{i}. {label_map.get(int(cid), cid)}: {probs[cid]:.2f}", (x, y), st.font, st.fscale,
                        (240, 240, 240), st.thick, cv2.LINE_AA)
            y += st.line
    if active_cls is not None:
        name = label_map.get(int(active_cls), str(active_cls))
        cv2.rectangle(frame, (0, h - 40), (w, h), (0, 200, 255), -1)
        cv2.putText(frame, f"ACTIVE: {name}", (st.pad, h - 12), st.font, 0.7, (0, 0, 0), 2, cv2.LINE_AA)


# =====================
# 特征提取（需要与训练时一致）
# =====================

def extract_features(frame_bgr: np.ndarray) -> np.ndarray:
    """
    24维特征提取 - 需要与训练时完全一致
    这里是一个示例实现，你需要根据实际训练时的特征提取方法修改
    """
    # 灰度化
    g = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2GRAY)
    g = cv2.resize(g, (64, 64), interpolation=cv2.INTER_AREA)

    # 颜色直方图 (16维)
    hist = cv2.calcHist([g], [0], None, [16], [0, 256]).flatten()
    hist = hist / (hist.sum() + 1e-6)

    # 纹理特征 - Sobel梯度 (2维)
    sx = cv2.Sobel(g, cv2.CV_32F, 1, 0, ksize=3)
    sy = cv2.Sobel(g, cv2.CV_32F, 0, 1, ksize=3)
    grad_magnitude = float(np.mean(np.hypot(sx, sy)))
    grad_direction = float(np.mean(np.arctan2(sy, sx)))

    # 运动特征 (4维) - 这里使用简单的帧差
    # 注意：在实际应用中，你可能需要维护前一帧的状态
    motion_features = np.array([grad_magnitude, grad_direction, 0.0, 0.0])

    # 组合特征
    feat = np.concatenate([
        hist.astype(np.float32),
        motion_features.astype(np.float32),
        np.array([0.0, 0.0], dtype=np.float32)  # 填充到24维
    ])

    # 确保特征维度正确
    if feat.shape[0] < FEATURE_DIM:
        feat = np.pad(feat, (0, FEATURE_DIM - feat.shape[0]))
    elif feat.shape[0] > FEATURE_DIM:
        feat = feat[:FEATURE_DIM]

    return feat.astype(np.float32)


# =====================
# 模型加载
# =====================

def load_pytorch_model(checkpoint_path: str, device: torch.device):
    """加载PyTorch模型"""
    checkpoint = torch.load(checkpoint_path, map_location="cpu")
    print(f"Checkpoint类型: {type(checkpoint)}")
    print(f"Checkpoint键数量: {len(checkpoint.keys())}")

    # 创建模型实例 - 完全匹配训练配置
    model = HybridSeqModel(
        in_dim=FEATURE_DIM,
        n_classes=NUM_CLASSES,
        channels=128,
        n_blocks=8,
        use_transformer=True,
        d_model=128,
        nhead=8,
        nlayers=2
    )

    try:
        # 直接加载权重
        model.load_state_dict(checkpoint)
        model.to(device).eval()
        print("✓ 成功加载模型")
        return model
    except Exception as e:
        print(f"✗ 模型加载失败: {e}")
        raise


# =====================
# 主流程
# =====================

def main():
    assert os.path.isfile(VIDEO_PATH), f"找不到视频：{VIDEO_PATH}"
    out_path = OUT_PATH or default_out_path(VIDEO_PATH)
    os.makedirs(os.path.dirname(out_path), exist_ok=True)

    print(f"[输入视频] {VIDEO_PATH}")
    print(f"[导出视频] {out_path}")
    print(f"[特征维度] {FEATURE_DIM}")
    print(f"[类别数量] {NUM_CLASSES}")

    # 加载模型
    assert os.path.isfile(CKPT_PATH), f"找不到模型文件：{CKPT_PATH}"
    print("正在加载模型...")
    model = load_pytorch_model(CKPT_PATH, DEVICE)

    # 标签
    label_map = load_label_map(LABEL_MAP)

    # 视频
    cap = cv2.VideoCapture(VIDEO_PATH)
    assert cap.isOpened(), f"无法打开视频：{VIDEO_PATH}"
    src_fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

    writer = cv2.VideoWriter(out_path, cv2.VideoWriter_fourcc(*"mp4v"), src_fps, (w, h))
    assert writer.isOpened(), "无法创建输出视频"

    # 采样/窗口/步长
    sample_every = max(1, int(round(src_fps / TARGET_FPS)))
    eff_fps = src_fps / sample_every
    window = max(1, int(round(WINDOW_SEC * eff_fps)))
    stride_frames = max(1, int(round(STRIDE_SEC * eff_fps)))

    # 状态
    buf: Deque[np.ndarray] = collections.deque(maxlen=window)
    ema = None
    alpha = float(SMOOTHING)
    frame_idx = -1
    last_infer_idx = -stride_frames
    t0 = time.time()
    fps_show = 0.0

    # 事件聚合规则 - 根据你的10个类别调整
    rules = {
        1: ClassRule(0.60, 0.45, 0.30),  # yaw_large
        2: ClassRule(0.60, 0.45, 0.30),  # pitch_down
        3: ClassRule(0.70, 0.55, 0.50),  # face_not_visible
        4: ClassRule(0.70, 0.55, 0.30),  # other_person
        5: ClassRule(0.70, 0.55, 0.30),  # suspicious_body
        6: ClassRule(0.70, 0.55, 3.50),  # leave_seat
        # 为其他类别添加默认规则
        7: ClassRule(0.60, 0.45, 0.30),
        8: ClassRule(0.60, 0.45, 0.30),
        9: ClassRule(0.60, 0.45, 0.30),
    }
    agg = EventAggregator(fps=eff_fps, label_map=label_map, rules=rules)

    print("[开始] 实时渲染…  (q 退出 / 空格 暂停 / s 截图 / w 切换写出)")
    paused = False
    write_on = True
    last_frame = None

    while True:
        if not paused:
            ok, frame = cap.read()
            if not ok:
                break
            frame_idx += 1
            last_frame = frame.copy()

            # FPS 显示
            if frame_idx % max(1, int(src_fps // 2)) == 0:
                dt = time.time() - t0
                if dt > 0:
                    fps_show = frame_idx / dt

            # 下采样输入推理
            if frame_idx % sample_every == 0:
                feat = extract_features(frame)
                assert feat.shape[-1] == FEATURE_DIM, f"FEATURE_DIM 不匹配: {feat.shape}"
                buf.append(feat)

                if len(buf) == window and (frame_idx - last_infer_idx) >= stride_frames:
                    last_infer_idx = frame_idx
                    x = np.stack(list(buf), axis=0)  # [T, F]
                    xt = torch.from_numpy(x).float().unsqueeze(0).to(DEVICE)  # [1, T, F]

                    with torch.no_grad():
                        out = model(xt)

                    # 取最后一帧的输出
                    if out.ndim == 3:  # [1, T, C]
                        out = out[:, -1, :]
                    prob = torch.softmax(out, dim=-1).squeeze(0).detach().cpu().numpy().astype(np.float32)
                    ema = prob if ema is None else (alpha * prob + (1 - alpha) * ema)
                    active = agg.update(ema)
                else:
                    active = agg.active_cls
            else:
                active = agg.active_cls

            draw_hud(frame, probs=(ema if ema is not None else np.zeros((NUM_CLASSES,), np.float32)),
                     label_map=label_map, active_cls=active, fps_show=fps_show)

            cv2.imshow("Realtime Test", frame)
            if write_on:
                writer.write(frame)

        key = cv2.waitKey(1) & 0xFF
        if key == ord('q'):
            break
        elif key == ord(' '):
            paused = not paused
        elif key == ord('s'):
            ts = int(time.time())
            snap = os.path.join(os.path.dirname(out_path), f"hud_{ts}.png")
            if last_frame is not None:
                cv2.imwrite(snap, last_frame)
                print(f"[截图] {snap}")
        elif key == ord('w'):
            write_on = not write_on
            print(f"[写出开关] {write_on}")

    agg.flush()
    # 导出事件
    prefix = os.path.splitext(out_path)[0]
    with open(prefix + "_events.json", "w", encoding="utf-8") as f:
        json.dump(agg.events, f, ensure_ascii=False, indent=2)
    print(f"[导出] {prefix}_events.json")

    cap.release()
    writer.release()
    cv2.destroyAllWindows()


if __name__ == "__main__":
    main()