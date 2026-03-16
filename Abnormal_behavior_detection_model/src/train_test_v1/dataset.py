"""
读取 features_v1/{vid}.npz 与 all_labels.npz，做 8s 滑窗切片供训练
"""
import numpy as np, os
import torch
from torch.utils.data import Dataset
from config import FEATURE_DIR, LABELS_NPZ_PATH, TARGET_FPS, WIN_SEC, STEP_SEC

class WindowDataset(Dataset):
    def __init__(self, video_ids, labels_npz_path=LABELS_NPZ_PATH, feature_dir=FEATURE_DIR,
                 win_sec=WIN_SEC, step_sec=STEP_SEC):
        self.vids = list(video_ids)
        self.pack = np.load(labels_npz_path, allow_pickle=True)
        self.labels_key = [k for k in self.pack["labels_key"]]
        self.C = len(self.labels_key)
        self.feature_dir = feature_dir
        self.win = int(round(win_sec * TARGET_FPS))
        self.step = int(round(step_sec * TARGET_FPS))

        # 预索引所有窗口 - 允许特征和标签长度有小幅差异
        self.index = []  # (vid, s, e)
        length_mismatches = 0
        total_windows = 0

        for vid in self.vids:
            # 加载特征和标签
            feat_path = os.path.join(self.feature_dir, f"{vid}.npz")
            if not os.path.exists(feat_path):
                print(f"[WARN] 特征文件不存在: {feat_path}")
                continue

            try:
                feat_data = np.load(feat_path)
                features = feat_data["feats"]
                labels = self.pack[f"{vid}__labels"]
                mask = self.pack[f"{vid}__mask"]
            except KeyError:
                print(f"[WARN] 视频 {vid} 的标签数据缺失，跳过")
                continue

            # 检查特征和标签长度
            feat_len = features.shape[0]
            label_len = labels.shape[0]

            # 使用最小长度确保安全
            T = min(feat_len, label_len)

            # 如果长度差异较大，记录但不跳过
            if abs(feat_len - label_len) > 10:  # 允许10帧的差异
                length_mismatches += 1
                print(f"[INFO] 视频 {vid} 长度不匹配: 特征={feat_len}, 标签={label_len}, 使用={T}")

            # 创建窗口
            windows_added = 0
            for s in range(0, max(1, T - self.win + 1), self.step):
                e = s + self.win
                if e <= T:
                    self.index.append((vid, s, e))
                    windows_added += 1
                    total_windows += 1

        print(f"[DATA] 有效窗口={len(self.index)} 长度不匹配视频={length_mismatches} win={self.win} step={self.step} fps={TARGET_FPS}")

        if len(self.index) == 0:
            print("[ERROR] 没有有效的训练窗口！请检查特征和标签数据。")
            # 打印一些调试信息
            print(f"[DEBUG] 视频ID数量: {len(self.vids)}")
            for vid in self.vids[:5]:  # 打印前5个视频的信息
                feat_path = os.path.join(self.feature_dir, f"{vid}.npz")
                if os.path.exists(feat_path):
                    feat_data = np.load(feat_path)
                    features = feat_data["feats"]
                    print(f"[DEBUG] {vid}: 特征长度={features.shape[0]}")
                else:
                    print(f"[DEBUG] {vid}: 特征文件不存在")

    def __len__(self):
        return len(self.index)

    def __getitem__(self, i):
        vid, s, e = self.index[i]

        # 加载特征
        feat_path = os.path.join(self.feature_dir, f"{vid}.npz")
        feat_data = np.load(feat_path)
        features = feat_data["feats"]

        # 加载标签和掩码
        labels = self.pack[f"{vid}__labels"]
        mask = self.pack[f"{vid}__mask"]

        # 截取窗口 - 确保不越界
        feat_len = features.shape[0]
        label_len = labels.shape[0]
        actual_end = min(e, feat_len, label_len)

        # 如果实际结束位置小于期望位置，调整起始位置
        if actual_end < e:
            s = actual_end - self.win
            if s < 0:
                s = 0

        X = features[s:actual_end]                   # [W,F]
        Y = labels[s:actual_end]                     # [W,C]
        M = mask[s:actual_end]                       # [W]

        # 确保所有样本长度一致
        current_len = X.shape[0]
        if current_len != self.win:
            # 如果长度不足，进行填充
            pad_len = self.win - current_len
            X = np.pad(X, ((0, pad_len), (0, 0)), mode='constant', constant_values=0)
            Y = np.pad(Y, ((0, pad_len), (0, 0)), mode='constant', constant_values=0)
            M = np.pad(M, (0, pad_len), mode='constant', constant_values=0)

        return torch.from_numpy(X).float(), torch.from_numpy(Y).float(), torch.from_numpy(M).float()

def split_train_val_ids(labels_npz_path=LABELS_NPZ_PATH, val_ratio=0.2, seed=42):
    pack = np.load(labels_npz_path, allow_pickle=True)
    vids = sorted(set([k.split("__")[0] for k in pack.files if k.endswith("__labels")]))
    rng = np.random.RandomState(seed)
    rng.shuffle(vids)
    n_val = max(1, int(len(vids) * val_ratio))
    return vids[n_val:], vids[:n_val]