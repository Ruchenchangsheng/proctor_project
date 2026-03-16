# convert_model.py
import torch
import torch.nn as nn
from video_test import SimpleLSTM, GRUModel, FEATURE_DIM, NUM_CLASSES


def convert_to_torchscript():
    """将PyTorch模型转换为TorchScript"""
    checkpoint_path = "../src/train_test_v1/runs/hseq/best.ckpt"
    output_path = "../src/train_test_v1/runs/hseq/model_traced.pt"

    # 加载checkpoint
    checkpoint = torch.load(checkpoint_path, map_location="cpu")
    print(f"Checkpoint类型: {type(checkpoint)}")

    # 尝试不同的模型结构
    models_to_try = [
        ("SimpleLSTM", SimpleLSTM(input_dim=FEATURE_DIM, num_classes=NUM_CLASSES)),
        ("GRUModel", GRUModel(input_dim=FEATURE_DIM, num_classes=NUM_CLASSES))
    ]

    for name, model in models_to_try:
        try:
            print(f"尝试转换 {name}...")

            # 加载权重
            if isinstance(checkpoint, dict):
                if "model" in checkpoint:
                    model.load_state_dict(checkpoint["model"])
                elif "state_dict" in checkpoint:
                    model.load_state_dict(checkpoint["state_dict"])
                else:
                    model.load_state_dict(checkpoint)
            else:
                model.load_state_dict(checkpoint)

            model.eval()

            # 创建示例输入
            example_input = torch.randn(1, 20, FEATURE_DIM)  # [batch, seq_len, features_v1]

            # 转换为TorchScript
            traced_model = torch.jit.trace(model, example_input)
            torch.jit.save(traced_model, output_path)

            print(f"✓ 成功转换并保存 {name} 到 {output_path}")
            return

        except Exception as e:
            print(f"✗ {name} 转换失败: {e}")
            continue

    print("所有模型转换尝试都失败了")


if __name__ == "__main__":
    convert_to_torchscript()