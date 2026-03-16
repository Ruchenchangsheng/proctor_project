import os, json
from typing import List, Dict, Tuple
import numpy as np

# ================== 1) 路径与超参（固定式配置） ==================
CORPUS_JSON_IN   = "../dataset/ann/corpus.json"         # 标注器输出
CORPUS_JSON_OUT  = "../dataset/ann/corpus_clean_v2.json"   # 清洗后输出
EXPORT_NPZ_PATH  = "../dataset/labels_npz/all_labels_v2.npz"  # ← 将所有视频帧级标签打包在一个 .npz；设为 None 则不导出

TARGET_FPS   = 30      # 帧级投影 FPS
SMOOTH_SEC   = 0.20    # 事件边界平滑（秒）
GAP_TOL_SEC  = 0.10    # 同类事件合并空隙容忍（秒）
MIN_DUR_SEC  = 0.30    # 清洗后最小时长（秒）
DO_CONFLICT  = True    # 是否做互斥/优先级冲突处理

# ========== 2) 标签集合（与训练通道顺序一致） ==========
ALL_LABELS = [
    "look_left","look_right","look_down","look_offscreen","face_not_visible",
    "talking","other_person_present","other_limb_present","multi_face","leave_seat"
]

# ========== 2.1 互斥与优先级配置 ==========
# 硬互斥（Hard）：出现重叠时必须裁掉一方
HARD_EXCLUSIVE = {
    ("look_left","look_right"),
    # 离座 vs 任何其它
    ("leave_seat","look_left"), ("leave_seat","look_right"),
    ("leave_seat","look_down"), ("leave_seat","look_offscreen"),
    ("leave_seat","face_not_visible"), ("leave_seat","talking"),
    ("leave_seat","other_person_present"), ("leave_seat","other_limb_present"),
    ("leave_seat","multi_face"),
    # 主脸不可见 vs 朝向/说话
    ("face_not_visible","look_left"), ("face_not_visible","look_right"),
    ("face_not_visible","look_down"), ("face_not_visible","talking"),
}

# 标签优先级（数值越大优先级越高；硬互斥裁剪时优先保留高优先级）
PRIORITY = {
    "leave_seat": 100,
    "face_not_visible": 90,
    "other_person_present": 80,
    "other_limb_present": 70,
    "multi_face": 60,
    "look_left": 50, "look_right": 50, "look_down": 50,
    "look_offscreen": 40,
    "talking": 30,
}

# 软互斥/派生（Soft）：出现同时则保留更具体/更有信息量的一方
# 例如：look_offscreen vs look_left/right/down ——> 保留具体方向
#       other_limb_present vs other_person_present ——> 保留 person
SOFT_PREFER = {
    ("look_offscreen","look_left"): "look_left",
    ("look_offscreen","look_right"): "look_right",
    ("look_offscreen","look_down"): "look_down",
    ("other_limb_present","other_person_present"): "other_person_present",
}

# ========== 4) 核心清洗工具函数 ==========
def merge_segments(segments: List[Dict], gap_tol: float) -> List[Dict]:
    if not segments: return []
    segs = sorted(segments, key=lambda x: (x["label"], x["start"], x["end"]))
    out = []
    for ev in segs:
        if not out:
            out.append(ev.copy()); continue
        last = out[-1]
        if ev["label"] == last["label"] and ev["start"] <= last["end"] + gap_tol:
            last["end"] = max(last["end"], ev["end"])
        else:
            out.append(ev.copy())
    return out

def subtract_intervals(ev: Dict, ignores: List[Dict]) -> List[Dict]:
    start, end = ev["start"], ev["end"]
    slots = [(start, end)]
    for ig in ignores:
        a, b = ig["start"], ig["end"]
        if b <= a: continue
        new_slots = []
        for s, e in slots:
            if e <= a or s >= b:
                new_slots.append((s, e))
            else:
                if s < a: new_slots.append((s, max(s, a)))
                if e > b: new_slots.append((min(e, b), e))
        slots = [(s, e) for (s, e) in new_slots if e - s > 1e-9]
    return [{"label": ev["label"], "start": s, "end": e} for s, e in slots]

def clamp(ev: Dict, t0: float, t1: float) -> Dict:
    ev = ev.copy()
    ev["start"] = max(t0, min(t1, ev["start"]))
    ev["end"]   = max(t0, min(t1, ev["end"]))
    return ev

def remove_too_short(segments: List[Dict], min_dur: float) -> List[Dict]:
    return [ev for ev in segments if (ev["end"] - ev["start"]) + 1e-9 >= min_dur]

def _is_hard_exclusive(a: str, b: str) -> bool:
    return (a, b) in HARD_EXCLUSIVE or (b, a) in HARD_EXCLUSIVE

def _soft_prefer(a: str, b: str):
    # 返回更应保留的label，或 None 表示无偏好
    for (x, y), keep in SOFT_PREFER.items():
        if (a == x and b == y) or (a == y and b == x):
            return keep
    return None

def resolve_conflicts(segments: List[Dict]) -> List[Dict]:
    """
    冲突处理：
      1) 硬互斥：按 PRIORITY 保留高优先级；相等则保留时长更长者
      2) 软互斥：按 SOFT_PREFER 的偏好保留更具体的一方
      3) 其余允许并存
    """
    if not segments: return []
    segs = sorted(segments, key=lambda x: (x["start"], x["end"]))
    keep = [True] * len(segs)

    for i in range(len(segs)):
        if not keep[i]: continue
        for j in range(i+1, len(segs)):
            if not keep[j]: continue
            A, B = segs[i], segs[j]
            la, lb = A["label"], B["label"]

            # 时间是否重叠
            s, e = max(A["start"], B["start"]), min(A["end"], B["end"])
            if e <= s: continue

            # 1) 硬互斥：优先级 > 时长
            if _is_hard_exclusive(la, lb):
                pa, pb = PRIORITY.get(la, 0), PRIORITY.get(lb, 0)
                if pa > pb:
                    keep[j] = False
                elif pb > pa:
                    keep[i] = False
                else:
                    da, db = (A["end"] - A["start"]), (B["end"] - B["start"])
                    if da >= db: keep[j] = False
                    else: keep[i] = False
                continue

            # 2) 软互斥：按偏好保留
            pref = _soft_prefer(la, lb)
            if pref is not None:
                if pref == la: keep[j] = False
                elif pref == lb: keep[i] = False
                continue

            # 3) 其它非互斥：并存（比如 multi_face 与 look_*）
            # 需要更强压制可在此追加基于 PRIORITY 的 overlap 抑制逻辑

    return [ev for k, ev in zip(keep, segs) if k]

def estimate_video_duration(entry: Dict) -> float:
    tmax = 0.0
    for seg in entry.get("segments", []): tmax = max(tmax, seg.get("end", 0.0))
    for ev in entry.get("events", []):    tmax = max(tmax, ev.get("end", 0.0))
    for ig in entry.get("ignore", []):    tmax = max(tmax, ig.get("end", 0.0))
    return tmax

def clean_events_for_entry(entry: Dict,
                           gap_tol: float,
                           min_dur: float,
                           do_conflict: bool) -> List[Dict]:
    raw_events  = entry.get("events", [])
    ignores     = entry.get("ignore", [])
    if not raw_events:
        return []
    T = estimate_video_duration(entry)
    merged = merge_segments(raw_events, gap_tol=gap_tol)
    after_sub = []
    for ev in merged:
        ev = clamp(ev, 0.0, T)
        after_sub.extend(subtract_intervals(ev, ignores))
    cleaned = remove_too_short(after_sub, min_dur=min_dur)
    if do_conflict:
        cleaned = resolve_conflicts(cleaned)
    final = merge_segments(cleaned, gap_tol=gap_tol)
    return final

# ========== 5) 帧级投影（不落盘；返回数组） ==========
def project_to_frames_arrays(entry: Dict, events_clean: List[Dict],
                             target_fps: int = 30, smooth_sec: float = 0.2):
    """
    返回 (labels, mask, fps)
    labels: [T, C] 多标签 0..1
    mask:   [T]     0/1，ignore=0
    """
    T_sec = max(estimate_video_duration(entry), (entry.get("segments", []) or [{"end":0.0}])[-1]["end"])
    T = int(np.ceil(T_sec * target_fps)) + target_fps  # 预留1s缓冲
    C = len(ALL_LABELS)
    labels = np.zeros((T, C), dtype=np.float32)
    mask   = np.ones((T,), dtype=np.float32)

    ramp = int(round(smooth_sec * target_fps))
    def ramp_fill(arr, j, s_sec, e_sec):
        s = int(np.floor(s_sec*target_fps)); e = int(np.ceil(e_sec*target_fps))
        s = max(0, s); e = min(T-1, e)
        if e < s: return
        arr[s:e+1, j] = 1.0
        # 边界平滑
        for i in range(max(0, s-ramp), s):
            arr[i, j] = max(arr[i, j], (i-(s-ramp))/max(1,ramp))
        for i in range(e+1, min(T, e+1+ramp)):
            arr[i, j] = max(arr[i, j], 1.0-(i-(e+1))/max(1,ramp))

    for ev in events_clean:
        if ev["label"] not in ALL_LABELS: continue
        j = ALL_LABELS.index(ev["label"])
        ramp_fill(labels, j, ev["start"], ev["end"])

    for ig in entry.get("ignore", []):
        s = int(np.floor(ig["start"]*target_fps)); e = int(np.ceil(ig["end"]*target_fps))
        s = max(0, s); e = min(T-1, e)
        mask[s:e+1] = 0.0

    return labels, mask, target_fps

# ========== 6) 主流程（固定常量控制 IO；导出单个 .npz） ==========
def main():
    # 读入原始 corpus
    if not os.path.exists(CORPUS_JSON_IN):
        raise FileNotFoundError(f"未找到标注文件：{CORPUS_JSON_IN}")
    corp = json.load(open(CORPUS_JSON_IN, "r", encoding="utf-8"))
    labels = corp.get("labels", {})

    out = {"version": corp.get("version", "v1"), "labels": {}}

    # 若需要统一导出 .npz，先准备一个 dict 收集所有视频的数组
    npz_payload = {"labels_key": np.array(ALL_LABELS, dtype=object)}

    # 逐视频清洗
    for vid, entry in labels.items():
        events_clean = clean_events_for_entry(entry,
                                              gap_tol=GAP_TOL_SEC,
                                              min_dur=MIN_DUR_SEC,
                                              do_conflict=DO_CONFLICT)
        new_entry = dict(entry)
        new_entry["events"] = events_clean
        out["labels"][vid] = new_entry

        raw_n = len(entry.get("events", []))
        print(f"[CLEAN] {vid}: raw={raw_n} -> clean={len(events_clean)}")

        # 收集帧级数组（统一写入一个 .npz）
        if EXPORT_NPZ_PATH:
            L, M, fps = project_to_frames_arrays(entry=new_entry,
                                                 events_clean=events_clean,
                                                 target_fps=TARGET_FPS,
                                                 smooth_sec=SMOOTH_SEC)
            npz_payload[f"{vid}__labels"] = L
            npz_payload[f"{vid}__mask"]   = M
            npz_payload[f"{vid}__fps"]    = np.array([fps], dtype=np.int32)

    # 写出清洗后的 corpus
    os.makedirs(os.path.dirname(CORPUS_JSON_OUT), exist_ok=True)
    with open(CORPUS_JSON_OUT, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)
    print(f"[OK] 保存清洗后的语料库：{CORPUS_JSON_OUT}")

    # 写出单个 .npz（包含全部视频）
    if EXPORT_NPZ_PATH:
        os.makedirs(os.path.dirname(EXPORT_NPZ_PATH), exist_ok=True)
        np.savez_compressed(EXPORT_NPZ_PATH, **npz_payload)
        print(f"[NPZ] 已导出全部视频到：{EXPORT_NPZ_PATH}")
        # 读取示例：np.load(EXPORT_NPZ_PATH); 键名如 '1__labels','1__mask','1__fps','labels_key'

if __name__ == "__main__":
    main()