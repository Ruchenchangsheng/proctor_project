"""
多标签任务的 Asymmetric Focal Loss（ASL）与时间一致性正则（TV-L1）
参考：Ridnik et al. "Asymmetric Loss For Multi-Label Classification" (ICCV'21)
"""
import torch
import torch.nn as nn
import torch.nn.functional as F

class AsymmetricLoss(nn.Module):
    """
    适用于多标签的 Focal 变体：
    - 对负样本使用更强的衰减（gamma_neg），缓解长尾类别的负样本主导问题
    - 可结合 clip 防止极端对数
    """
    def __init__(self, gamma_pos=0.0, gamma_neg=4.0, clip=0.05, eps=1e-8, reduction='none'):
        super().__init__()
        self.gp = gamma_pos
        self.gn = gamma_neg
        self.clip = clip
        self.eps = eps
        self.reduction = reduction

    def forward(self, logits, targets):
        # logits:[B,W,C], targets:[B,W,C]
        x_sigmoid = torch.sigmoid(logits)
        # clip 负例概率，防止 -log(1-p) 在 p→1 时爆炸
        if self.clip is not None and self.clip > 0:
            x_sigmoid = torch.clamp(x_sigmoid, self.clip, 1.0 - self.clip)
        xs_pos = x_sigmoid
        xs_neg = 1.0 - x_sigmoid

        # pt
        pt_pos = xs_pos * targets
        pt_neg = xs_neg * (1 - targets)

        # Focal 权重
        w_pos = (1 - pt_pos).pow(self.gp)
        w_neg = (1 - pt_neg).pow(self.gn)

        loss_pos = -torch.log(torch.clamp(xs_pos, self.eps, 1.0)) * w_pos * targets
        loss_neg = -torch.log(torch.clamp(xs_neg, self.eps, 1.0)) * w_neg * (1 - targets)
        loss = loss_pos + loss_neg

        if self.reduction == 'mean':
            return loss.mean()
        elif self.reduction == 'sum':
            return loss.sum()
        return loss  # [B,W,C]

def temporal_tv_loss(logits, mask, weight=0.02):
    """
    时间一致性（Total Variation）损失：鼓励相邻帧预测平滑（降低抖动）
    """
    if weight <= 0:
        return torch.tensor(0., device=logits.device)

    # 计算相邻帧的差异 [B, W-1, C]
    diff = logits[:, 1:, :] - logits[:, :-1, :]

    # 创建有效掩码（两个相邻帧都有效）[B, W-1]
    m = (mask[:, 1:] > 0.5) & (mask[:, :-1] > 0.5)

    if m.sum() == 0:
        return torch.tensor(0., device=logits.device)

    # 对每个通道应用相同的mask，然后求平均
    # 先按通道维度求平均，再应用mask
    diff_mean = torch.abs(diff).mean(dim=-1)  # [B, W-1]
    loss = (diff_mean * m).sum() / m.sum()

    return weight * loss