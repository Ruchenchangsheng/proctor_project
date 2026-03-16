# -*- coding: utf-8 -*-
"""
将 HybridSeqModel 导出为 ONNX；固定序列长度（例如 8s@30fps = 240）
"""
import os, torch, numpy as np
from model_seq import HybridSeqModel
from config import TARGET_FPS, WIN_SEC

SEQ = int(WIN_SEC * TARGET_FPS)

def export(in_dim, n_classes, out_path="runs/export/hseq.onnx"):
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    model = HybridSeqModel(in_dim, n_classes)
    model.eval()
    dummy = torch.randn(1, SEQ, in_dim)
    torch.onnx.export(model, dummy, out_path,
                      input_names=["x"], output_names=["logits"],
                      dynamic_axes={"x":{0:"B"}, "logits":{0:"B"}},
                      opset_version=17)
    print("[ONNX] 导出：", out_path)

if __name__ == "__main__":
    import glob
    feats_any = np.load(glob.glob("dataset/features_v1/*.npz")[0])["feats"]
    in_dim = feats_any.shape[1]
    labels_key = list(np.load("dataset/labels_npz/all_labels_v1.npz", allow_pickle=True)["labels_key"])
    export(in_dim, len(labels_key))
