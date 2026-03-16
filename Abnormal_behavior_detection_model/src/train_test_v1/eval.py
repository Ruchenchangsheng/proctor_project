# eval.py
# -*- coding: utf-8 -*-
import os, json, csv, numpy as np, torch, sys
from torch.utils.data import DataLoader
from dataset import WindowDataset, split_train_val_ids
from model_seq import HybridSeqModel
from metrics_events import frame_metrics, probs_to_events, event_f1, pr_curve_data
from config import LABELS_NPZ_PATH, FEATURE_DIR, BATCH_SIZE
import matplotlib.pyplot as plt

CKPT = "runs/hseq/best.ckpt"
OUT_DIR = "eval_report"; os.makedirs(OUT_DIR, exist_ok=True)

def load_labels_key():
    pack = np.load(LABELS_NPZ_PATH, allow_pickle=True)
    return [k for k in pack["labels_key"]]

@torch.no_grad()
def run_eval():
    labels_key = load_labels_key()
    # 划分（沿用 val_ids 作为评测集；如需独立 test，替换此处）
    _, val_ids = split_train_val_ids()
    if len(val_ids) == 0:
        print("[ERROR] val_ids 为空，请检查 labels_npz 或划分函数"); return

    # 载入任意一个 val 的特征，确定输入维度
    any_feat_path = os.path.join(FEATURE_DIR, f"{val_ids[0]}.npz")
    if not os.path.exists(any_feat_path):
        print(f"[ERROR] 缺少特征文件：{any_feat_path}"); return
    any_feat = np.load(any_feat_path)
    in_dim = any_feat["feats"].shape[1]
    n_classes = len(labels_key)

    # 构建数据加载器（Windows 上建议 num_workers=0）
    num_workers = 0 if sys.platform.startswith("win") else 4
    ds = WindowDataset(val_ids)
    if len(ds) == 0:
        print("[ERROR] WindowDataset 为空，请检查特征与标签长度是否匹配"); return
    dl = DataLoader(ds, batch_size=BATCH_SIZE, shuffle=False, num_workers=num_workers, pin_memory=True)

    # 模型 + 权重
    model = HybridSeqModel(in_dim, n_classes)
    ckpt = torch.load(CKPT, map_location="cpu")
    # 兼容：有 model. 前缀或直接存 state_dict
    if "state_dict" in ckpt:
        sd = ckpt["state_dict"]
    else:
        sd = ckpt
    new_sd = {}
    for k, v in sd.items():
        if k.startswith("model."):
            new_sd[k.split("model.", 1)[-1]] = v
        else:
            new_sd[k] = v
    missing, unexpected = model.load_state_dict(new_sd, strict=False)
    if missing or unexpected:
        print("[WARN] missing:", missing, "unexpected:", unexpected)
    model.eval()

    # 推理 & 指标
    all_probs, all_y, all_m = [], [], []
    for x, y, m in dl:
        logits = model(x)         # [B,W,C]
        probs = torch.sigmoid(logits).cpu().numpy()
        all_probs.append(probs.reshape(-1, probs.shape[-1]))
        all_y.append(y.numpy().reshape(-1, y.shape[-1]))
        all_m.append(m.numpy().reshape(-1))
    probs = np.concatenate(all_probs, 0); y = np.concatenate(all_y, 0); mask = np.concatenate(all_m, 0)

    mAP, f1_frame = frame_metrics(probs, y, mask)
    pred_events = probs_to_events(probs, labels_key)
    gt_events   = probs_to_events(y, labels_key, enter_thr=0.5, exit_thr=0.5)
    prec, rec, f1_evt = event_f1(pred_events, gt_events, iou_thr=0.5)

    print(f"[EVAL] frame mAP={mAP:.4f}  F1_frame={f1_frame:.4f}  | event F1@0.5IoU={f1_evt:.4f}")
    json.dump({
        "frame_mAP": float(mAP),
        "frame_F1": float(f1_frame),
        "event_precision": float(prec),
        "event_recall": float(rec),
        "event_F1": float(f1_evt)
    }, open(os.path.join(OUT_DIR, "summary.json"), "w"), indent=2, ensure_ascii=False)

    # PR 曲线与 per-class AP 估计
    pr = pr_curve_data(probs, y, labels_key)  # 返回 {name: (P,R,Th)}
    # 简单用梯形法近似 AP（或在 frame_metrics 内部已有 per-class，可直接取）
    def trapz_ap(P,R):
        # 假设 R 单调递增
        ap = 0.0
        for i in range(1, len(P)):
            ap += (R[i] - R[i-1]) * max(P[i], P[i-1])
        return float(max(0.0, min(1.0, ap)))

    with open(os.path.join(OUT_DIR, "per_class_ap.csv"), "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f); w.writerow(["label", "approx_AP"])
        for name, (P,R,Th) in pr.items():
            ap = trapz_ap(P,R)
            w.writerow([name, f"{ap:.6f}"])
            # 画 PR 曲线
            plt.figure(figsize=(4,3))
            plt.plot(R, P)
            plt.xlabel("Recall"); plt.ylabel("Precision"); plt.title(name)
            plt.tight_layout(); plt.savefig(os.path.join(OUT_DIR, f"pr_{name}.png")); plt.close()

if __name__ == "__main__":
    run_eval()
