# -*- coding: utf-8 -*-
"""
将视频对齐到 TARGET_FPS 并提取逐帧特征，缓存为 {vid}.npz。
你需要在 _extract_frame_features(...) 中接入检测层信号：
- 头姿：yaw/pitch/roll + 速度
- 人脸质量、活体、人脸数
- 多人人体：实例数、主/非主区域关键点可见性、分割面积比例
"""
import os, json, cv2, numpy as np
from config import FEATURE_DIR, TARGET_FPS, CLEAN_CORPUS
from absl import logging as absl_logging
absl_logging.set_verbosity(absl_logging.ERROR)
from tqdm import tqdm
import time


os.makedirs(FEATURE_DIR, exist_ok=True)

# -------------- MediaPipe 懒加载（健壮）--------------
def _ensure_mediapipe(cache):
    if cache.get("mp_inited"):
        return True
    cache["mp_ok"] = {"fd": False, "fm": False, "pose": False, "seg": False}
    try:
        import mediapipe as mp
        cache["mp"] = mp
    except Exception as e:
        cache["mp_inited"] = False
        cache["mp_error"] = f"import mediapipe failed: {e}"
        return False
    # 分别初始化，失败不抛错
    try:
        cache["mp_fd"] = cache["mp"].solutions.face_detection.FaceDetection(
            model_selection=1, min_detection_confidence=0.5
        ); cache["mp_ok"]["fd"] = True
    except Exception as e:
        cache["mp_fd"] = None; cache["mp_ok"]["fd_err"] = str(e)
    try:
        cache["mp_fm"] = cache["mp"].solutions.face_mesh.FaceMesh(
            static_image_mode=False, max_num_faces=1, refine_landmarks=True,
            min_detection_confidence=0.5, min_tracking_confidence=0.5
        ); cache["mp_ok"]["fm"] = True
    except Exception as e:
        cache["mp_fm"] = None; cache["mp_ok"]["fm_err"] = str(e)
    try:
        cache["mp_pose"] = cache["mp"].solutions.pose.Pose(
            static_image_mode=False, model_complexity=1,
            min_detection_confidence=0.5, min_tracking_confidence=0.5
        ); cache["mp_ok"]["pose"] = True
    except Exception as e:
        cache["mp_pose"] = None; cache["mp_ok"]["pose_err"] = str(e)
    try:
        cache["mp_seg"] = cache["mp"].solutions.selfie_segmentation.SelfieSegmentation(
            model_selection=1
        ); cache["mp_ok"]["seg"] = True
    except Exception as e:
        cache["mp_seg"] = None; cache["mp_ok"]["seg_err"] = str(e)
    cache["mp_inited"] = True
    return True

def _resample_indices(n_src, fps_src, fps_tgt):
    dur = n_src / max(1e-6, fps_src)
    n_tgt = int(round(dur * fps_tgt))
    t = np.linspace(0, dur, num=n_tgt, endpoint=False)
    idx = np.clip((t * fps_src).round().astype(int), 0, n_src-1)
    return idx

def _letterbox_square(bgr, dst_size=256):
    h, w = bgr.shape[:2]
    s = dst_size / max(h, w)
    nh, nw = int(round(h*s)), int(round(w*s))
    resized = cv2.resize(bgr, (nw, nh), interpolation=cv2.INTER_AREA)
    out = np.zeros((dst_size, dst_size, 3), dtype=bgr.dtype)
    top = (dst_size - nh) // 2
    left = (dst_size - nw) // 2
    out[top:top+nh, left:left+nw] = resized
    M = np.array([[s, 0, left], [0, s, top], [0, 0, 1]], dtype=np.float32)
    return out, M

def _extract_frame_features(frame, cache):
    """
    返回：feat(np.float32, [F])。
    已补齐“检测层”特征
    """
    # —— 用正方形 letterbox 作为 MP 输入，提高稳定性 ——
    sq_bgr, _M = _letterbox_square(frame, dst_size=256)
    rgb = cv2.cvtColor(sq_bgr, cv2.COLOR_BGR2RGB)
    sq_gray = cv2.cvtColor(sq_bgr, cv2.COLOR_BGR2GRAY)
    H, W = sq_gray.shape[:2]

    # ---------- 基础视觉（在 square 上） ----------
    mean = sq_gray.mean() / 255.0
    std  = sq_gray.std()  / 255.0
    lap  = cv2.Laplacian(sq_gray, cv2.CV_64F).var() / 1000.0
    motion = 0.0; hist_sim = 1.0
    if cache.get("prev_gray") is not None:
        diff = cv2.absdiff(sq_gray, cache["prev_gray"])
        motion = float(diff.mean()) / 255.0
        h1 = cv2.calcHist([sq_gray],[0],None,[32],[0,256]); h2 = cv2.calcHist([cache["prev_gray"]],[0],None,[32],[0,256])
        cv2.normalize(h1,h1); cv2.normalize(h2,h2)
        hist_sim = float(cv2.compareHist(h1, h2, cv2.HISTCMP_CORREL))
    cache["prev_gray"] = sq_gray
    feat = [mean, std, lap, motion, hist_sim]

    # ---------- MediaPipe （安全获取后再用） ----------
    mp_ok = _ensure_mediapipe(cache)
    yaw=pitch=roll=0.0
    dyaw=dpitch=droll=0.0
    face_quality=0.0
    liveness_score=0.0
    face_ohe=[1.0,0.0,0.0]
    people_ohe=[1.0,0.0,0.0]
    torso_vis=0.0
    other_area_ratio=0.0
    EAR_l=EAR_r=MAR=0.0
    main_box = None

    if mp_ok:
        # --- FaceDetection ---
        fd = cache.get("mp_fd")
        if fd is not None:
            try:
                fd_res = fd.process(rgb)
                dets = fd_res.detections or []
                n_face = len(dets)
                if n_face == 0: face_ohe = [1.0,0.0,0.0]
                elif n_face == 1: face_ohe = [0.0,1.0,0.0]
                else: face_ohe = [0.0,0.0,1.0]
                if dets:
                    d = sorted(dets, key=lambda d: d.score[0], reverse=True)[0]
                    bb = d.location_data.relative_bounding_box
                    x1 = max(0, int(bb.xmin * W)); y1 = max(0, int(bb.ymin * H))
                    x2 = min(W, int((bb.xmin + bb.width) * W)); y2 = min(H, int((bb.ymin + bb.height) * H))
                    if x2>x1 and y2>y1:
                        main_box = (x1,y1,x2,y2)
                        crop = sq_gray[y1:y2, x1:x2]
                        if crop.size>0:
                            face_quality = float(cv2.Laplacian(crop, cv2.CV_64F).var() / 1000.0)
            except Exception:
                pass

        # --- FaceMesh：头姿 + EAR/MAR + 活体 proxy ---
        fm = cache.get("mp_fm")
        if fm is not None:
            try:
                fm_res = fm.process(rgb)
                if fm_res.multi_face_landmarks:
                    lm = fm_res.multi_face_landmarks[0].landmark
                    idx = {"nose":1,"chin":152,"eye_l":33,"eye_r":263,"mouth_l":61,"mouth_r":291}
                    pts2d = np.array([
                        [lm[idx["nose"]].x*W, lm[idx["nose"]].y*H],
                        [lm[idx["chin"]].x*W, lm[idx["chin"]].y*H],
                        [lm[idx["eye_l"]].x*W, lm[idx["eye_l"]].y*H],
                        [lm[idx["eye_r"]].x*W, lm[idx["eye_r"]].y*H],
                        [lm[idx["mouth_l"]].x*W, lm[idx["mouth_l"]].y*H],
                        [lm[idx["mouth_r"]].x*W, lm[idx["mouth_r"]].y*H],
                    ], dtype=np.float32)
                    pts3d = np.array([
                        [0.0,   0.0,   0.0],
                        [0.0,  -63.6, -12.5],
                        [-43.3, 32.7, -26.0],
                        [43.3,  32.7, -26.0],
                        [-28.9,-28.9, -24.1],
                        [28.9, -28.9, -24.1],
                    ], dtype=np.float32)
                    f = W; K = np.array([[f,0,W/2],[0,f,H/2],[0,0,1]], dtype=np.float32)
                    dist = np.zeros((4,1), dtype=np.float32)
                    ok, rvec, tvec = cv2.solvePnP(pts3d, pts2d, K, dist, flags=cv2.SOLVEPNP_ITERATIVE)
                    if ok:
                        R,_ = cv2.Rodrigues(rvec)
                        sy = np.sqrt(R[0,0]**2 + R[1,0]**2)
                        pitch = np.degrees(np.arctan2(R[2,1], R[2,2]))
                        yaw   = np.degrees(np.arctan2(-R[2,0], sy))
                        roll  = np.degrees(np.arctan2(R[1,0], R[0,0]))
                        if "prev_pose" in cache:
                            py,pit,pr = cache["prev_pose"]
                            dyaw   = yaw   - py
                            dpitch = pitch - pit
                            droll  = roll  - pr
                        cache["prev_pose"] = (yaw, pitch, roll)
                    # EAR/MAR
                    li = [33,160,158,133,153,144]; ri = [263,387,385,362,380,373]
                    def EAR(landmarks, idxs):
                        p = np.array([[landmarks[i].x*W, landmarks[i].y*H] for i in idxs], dtype=np.float32)
                        return float((np.linalg.norm(p[1]-p[5]) + np.linalg.norm(p[2]-p[4])) /
                                     (2.0*np.linalg.norm(p[0]-p[3]) + 1e-6))
                    EAR_l = EAR(lm, li); EAR_r = EAR(lm, ri)
                    p13 = np.array([lm[13].x*W, lm[13].y*H]); p14 = np.array([lm[14].x*W, lm[14].y*H])
                    p61 = np.array([lm[61].x*W, lm[61].y*H]); p291= np.array([lm[291].x*W, lm[291].y*H])
                    MAR = float(np.linalg.norm(p13-p14) / (np.linalg.norm(p61-p291) + 1e-6))
                    # 活体 proxy
                    if "prev_ear_mar" in cache:
                        pl, prr, pm = cache["prev_ear_mar"]
                        dyn = abs(EAR_l-pl) + abs(EAR_r-prr) + 0.5*abs(MAR-pm)
                    else:
                        dyn = 0.0
                    cache["prev_ear_mar"] = (EAR_l, EAR_r, MAR)
                    liveness_score = float(
                        0.4*max(0.0, min(1.0, (EAR_l+EAR_r)/2.0*2.0)) +
                        0.3*max(0.0, min(1.0, MAR*2.0)) +
                        0.3*max(0.0, min(1.0, (abs(dyaw)+abs(dpitch)+abs(droll))/60.0))
                    )
            except Exception:
                pass

        # --- Pose：躯干可见度 ---
        pose = cache.get("mp_pose")
        if pose is not None:
            try:
                pose_res = pose.process(rgb)
                if pose_res.pose_landmarks:
                    lm = pose_res.pose_landmarks.landmark
                    ids = [0,11,12,23,24]
                    torso_vis = float(np.mean([lm[i].visibility for i in ids]))
            except Exception:
                pass

        # --- Segmentation：他人区域比例 + 人体数量粗估 ---
        seg = cache.get("mp_seg")
        if seg is not None:
            try:
                seg_res = seg.process(rgb)
                if seg_res.segmentation_mask is not None:
                    mask = (seg_res.segmentation_mask > 0.5).astype(np.uint8)
                    person_area = int(mask.sum())
                    if main_box is not None:
                        x1,y1,x2,y2 = main_box
                        pad = int(0.2*max(x2-x1, y2-y1))
                        xa = max(0, x1-pad); ya = max(0, y1-pad)
                        xb = min(W, x2+pad); yb = min(H, y2+pad)
                        subject = np.zeros_like(mask); subject[ya:yb, xa:xb] = 1
                        other_pixels = int((mask*(1-subject)).sum())
                        other_area_ratio = float(other_pixels / max(1, person_area))
                    # 人体数量粗估
                    if face_ohe == [0.0,0.0,1.0]:
                        people_ohe = [0.0,0.0,1.0]
                    elif face_ohe == [0.0,1.0,0.0] or person_area > 0.2*H*W:
                        people_ohe = [0.0,1.0,0.0]
                    else:
                        people_ohe = [1.0,0.0,0.0]
            except Exception:
                pass

    feat += [
        yaw, pitch, roll, dyaw, dpitch, droll,
        face_quality, liveness_score,
        *face_ohe, *people_ohe,
        torso_vis, other_area_ratio,
        EAR_l, EAR_r, MAR
    ]
    return np.array(feat, dtype=np.float32)

# def extract_video_to_npz(video_path: str, vid: str):
#     cap = cv2.VideoCapture(video_path)
#     fps_src = cap.get(cv2.CAP_PROP_FPS) or 30.0
#     n_src   = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
#     if n_src <= 0:
#         print(f"[WARN] empty video: {video_path}"); return
#     idx_map = _resample_indices(n_src, fps_src, TARGET_FPS)
#
#     feats = []
#     cache = {"prev_gray": None}
#     last_idx = -1
#     for idx in idx_map:
#         if idx != last_idx:
#             cap.set(cv2.CAP_PROP_POS_FRAMES, int(idx))
#             ret, frame = cap.read()
#             if not ret:
#                 feats.append(feats[-1] if feats else np.zeros(5, np.float32))
#                 continue
#             f = _extract_frame_features(frame, cache)
#             feats.append(f); last_idx = idx
#         else:
#             feats.append(feats[-1])
#     cap.release()
#
#     feats = np.stack(feats, axis=0)
#     mu, sigma = feats.mean(axis=0, keepdims=True), feats.std(axis=0, keepdims=True) + 1e-6
#     feats = (feats - mu) / sigma
#
#     out = os.path.join(FEATURE_DIR, f"{vid}.npz")
#     np.savez_compressed(out, feats=feats, fps=np.array([TARGET_FPS], np.int32), mu=mu, sigma=sigma)
#     print(f"[FEAT] {vid}: T={len(feats)} F={feats.shape[1]} -> {out}")

def extract_video_to_npz(video_path: str, vid: str):
    cap = cv2.VideoCapture(video_path)
    fps_src = cap.get(cv2.CAP_PROP_FPS) or 30.0
    n_src = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    if n_src <= 0:
        print(f"[WARN] 空视频: {video_path}");
        return

    idx_map = _resample_indices(n_src, fps_src, TARGET_FPS)
    total_frames = len(idx_map)

    print(f"[开始] {vid}: 源帧数={n_src}, 目标帧数={total_frames}, 时长={n_src / fps_src:.1f}s")

    feats = []
    cache = {"prev_gray": None}
    last_idx = -1

    for i, idx in enumerate(idx_map):
        # 每处理100帧打印一次进度
        if i % 100 == 0:
            progress = (i + 1) / total_frames * 100
            print(f"[进度] {vid}: {i + 1}/{total_frames} ({progress:.1f}%)")

        if idx != last_idx:
            cap.set(cv2.CAP_PROP_POS_FRAMES, int(idx))
            ret, frame = cap.read()
            if not ret:
                feats.append(feats[-1] if feats else np.zeros(5, np.float32))
                continue
            f = _extract_frame_features(frame, cache)
            feats.append(f);
            last_idx = idx
        else:
            feats.append(feats[-1])

    cap.release()

    # 后续处理保持不变...
    feats = np.stack(feats, axis=0)
    mu, sigma = feats.mean(axis=0, keepdims=True), feats.std(axis=0, keepdims=True) + 1e-6
    feats = (feats - mu) / sigma

    out = os.path.join(FEATURE_DIR, f"{vid}.npz")
    np.savez_compressed(out, feats=feats, fps=np.array([TARGET_FPS], np.int32), mu=mu, sigma=sigma)
    print(f"[完成] {vid}: T={len(feats)} F={feats.shape[1]} -> {out}")

if __name__ == "__main__":
    corpus = json.load(open(CLEAN_CORPUS, "r", encoding="utf-8"))
    for vid, entry in corpus["labels"].items():
        vp = entry.get("video_path")
        if not vp or not os.path.exists(vp):
            print(f"[SKIP] missing video_path for {vid}")
            continue
        extract_video_to_npz(vp, vid)
