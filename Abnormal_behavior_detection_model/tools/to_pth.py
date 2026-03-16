import os, torch

ckpt_path = r"../src/train_test_v1/runs/hseq/best.ckpt"  # 换成你实际打印出的最佳权重路径
out_pth   = r"../src/runs/hseq/best_state.pth"

ckpt = torch.load(ckpt_path, map_location="cpu")

# Lightning 的 .ckpt 里通常有 'state_dict'
state_dict = ckpt.get("state_dict", ckpt)

# 可选：去掉常见前缀（Lightning 会给你的模型加 'model.' 前缀）
new_sd = {}
for k, v in state_dict.items():
    if k.startswith("model."):  # 你的推理代码如果不需要这个前缀，去掉它更方便
        new_sd[k[6:]] = v
    else:
        new_sd[k] = v

torch.save(new_sd, out_pth)
print("saved as:", out_pth)
