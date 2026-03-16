# -*- coding: utf-8 -*-
"""
帧概率 -> 事件；事件级 F1；FP/hour；PR 曲线辅助
"""
import numpy as np
from sklearn.metrics import average_precision_score, precision_recall_curve
from config import ENTER_THR, EXIT_THR, MIN_DUR, TARGET_FPS

def probs_to_events(probs, labels_key, enter_thr=ENTER_THR, exit_thr=EXIT_THR, min_dur=MIN_DUR):
    T, C = probs.shape
    events = {lb: [] for lb in labels_key}
    for j, lb in enumerate(labels_key):
        on = False; s = 0
        for t in range(T):
            p = probs[t, j]
            if not on and p >= enter_thr:
                on = True; s = t
            elif on and p < exit_thr:
                e = t
                dur = (e - s)/TARGET_FPS
                if dur >= min_dur.get(lb, 0.3):
                    events[lb].append((s/TARGET_FPS, e/TARGET_FPS))
                on = False
        if on:
            e = T
            dur = (e - s)/TARGET_FPS
            if dur >= min_dur.get(lb, 0.3):
                events[lb].append((s/TARGET_FPS, e/TARGET_FPS))
    return events

def iou_1d(a, b):
    s = max(a[0], b[0]); e = min(a[1], b[1])
    inter = max(0.0, e - s)
    uni = (a[1]-a[0]) + (b[1]-b[0]) - inter
    return inter/uni if uni>0 else 0.0

def event_f1(pred, gt, iou_thr=0.5):
    TP=0; P=0; G=0
    for lb in gt.keys():
        G += len(gt[lb]); P += len(pred.get(lb, []))
        used = set()
        for p in pred.get(lb, []):
            flag=False
            for i,g in enumerate(gt[lb]):
                if i in used: continue
                if iou_1d(p,g) >= iou_thr:
                    TP += 1; used.add(i); flag=True; break
    prec = TP/max(1,P); rec = TP/max(1,G); f1 = 2*prec*rec/max(1e-9,(prec+rec))
    return prec, rec, f1

def frame_metrics(probs, y_true, mask):
    """
    计算帧级 mAP 与 F1(0.5)
    probs,y_true: [N,C]；mask:[N] (0/1)
    """
    valid = mask > 0.5
    probs = probs[valid]; y_true = y_true[valid]
    C = probs.shape[1]
    aps = []
    for c in range(C):
        try:
            aps.append(average_precision_score(y_true[:,c], probs[:,c]))
        except:
            aps.append(0.0)
    # F1@0.5
    pred = (probs >= 0.5).astype(np.float32)
    tp = (pred * y_true).sum(); fp = (pred*(1-y_true)).sum(); fn = ((1-pred)*y_true).sum()
    precision = tp/max(1,tp+fp); recall = tp/max(1,tp+fn); f1 = 2*precision*recall/max(1e-9,(precision+recall))
    return float(np.mean(aps)), float(f1)

def pr_curve_data(probs, y_true, label_names):
    """
    输出每类 PR 曲线数据 points，用于画图
    返回 dict[label] = (precision, recall, thresholds)
    """
    out = {}
    for i, name in enumerate(label_names):
        try:
            p, r, th = precision_recall_curve(y_true[:,i], probs[:,i])
            out[name] = (p, r, th)
        except:
            out[name] = (np.array([1.0]), np.array([0.0]), np.array([0.5]))
    return out
