# # -*- coding: utf-8 -*-
# """
# MS-TCN（多尺度膨胀卷积）+ SE 注意力 + 轻量 Transformer （可选）
# 逐帧输出多标签 logits: [B, W, C]
# """
# import torch, torch.nn as nn
# from config import USE_TRANSFORMER, TCN_CHANNELS, TCN_BLOCKS
#
# class SE1D(nn.Module):
#     """Squeeze-and-Excitation 通道注意力"""
#     def __init__(self, ch, r=8):
#         super().__init__()
#         self.fc = nn.Sequential(
#             nn.AdaptiveAvgPool1d(1),
#             nn.Conv1d(ch, ch//r, 1), nn.ReLU(inplace=True),
#             nn.Conv1d(ch//r, ch, 1), nn.Sigmoid()
#         )
#     def forward(self, x):   # [B,C,W]
#         w = self.fc(x)
#         return x * w
#
# class MSBlock(nn.Module):
#     """多尺度膨胀卷积块：并联不同 dilation，拼接后 1x1 压缩，含残差+SE"""
#     def __init__(self, in_ch, out_ch, ks=3, dilations=(1,2,4,8), dropout=0.1):
#         super().__init__()
#         self.branches = nn.ModuleList([
#             nn.Sequential(
#                 nn.Conv1d(in_ch, out_ch, ks, padding=d*(ks-1), dilation=d),
#                 nn.GroupNorm(8, out_ch),
#                 nn.ReLU(inplace=True),
#                 nn.Dropout(dropout),
#             ) for d in dilations
#         ])
#         self.merge = nn.Conv1d(out_ch*len(dilations), out_ch, 1)
#         self.se    = SE1D(out_ch)
#         self.down  = nn.Conv1d(in_ch, out_ch, 1) if in_ch!=out_ch else nn.Identity()
#         self.act   = nn.ReLU(inplace=True)
#
#     def forward(self, x):  # [B,C,W]
#         outs = [b(x) for b in self.branches]
#         y = torch.cat(outs, dim=1)
#         y = self.merge(y)
#         y = self.se(y)
#         return self.act(y + self.down(x))
#
# class HybridSeqModel(nn.Module):
#     """
#     主干：MS-TCN 堆叠；可选接一层轻量 Transformer
#     """
#     def __init__(self, in_dim, n_classes, channels=TCN_CHANNELS, n_blocks=TCN_BLOCKS, dropout=0.1,
#                  use_transformer=USE_TRANSFORMER, d_model=128, nhead=4, nlayers=2):
#         super().__init__()
#         self.stem = nn.Conv1d(in_dim, channels, 1)
#         blocks = []
#         for _ in range(n_blocks):
#             blocks.append(MSBlock(channels, channels, ks=3, dilations=(1,2,4,8), dropout=dropout))
#         self.tcn = nn.Sequential(*blocks)
#         self.use_tf = use_transformer
#         if use_transformer:
#             self.proj_in  = nn.Conv1d(channels, d_model, 1)
#             enc_layer = nn.TransformerEncoderLayer(d_model=d_model, nhead=nhead, dim_feedforward=d_model*4,
#                                                    dropout=0.1, batch_first=True, norm_first=True)
#             self.tf = nn.TransformerEncoder(enc_layer, num_layers=nlayers)
#             self.proj_out = nn.Conv1d(d_model, channels, 1)
#         self.head = nn.Conv1d(channels, n_classes, 1)
#
#     def forward(self, x):   # x: [B,W,F]
#         x = x.transpose(1,2)         # [B,F,W]
#         h = self.stem(x)             # [B,C,W]
#         h = self.tcn(h)              # [B,C,W]
#         if self.use_tf:
#             z = self.proj_in(h).transpose(1,2)  # [B,W,D]
#             z = self.tf(z)                      # [B,W,D]
#             h = self.proj_out(z.transpose(1,2)) # [B,C,W]
#         y = self.head(h).transpose(1,2)         # [B,W,C]
#         return y


# -*- coding: utf-8 -*-
"""
MS-TCN（多尺度膨胀卷积）+ SE 注意力 + 轻量 Transformer （可选）
逐帧输出多标签 logits: [B, W, C]
"""
import torch, torch.nn as nn
from config import USE_TRANSFORMER, TCN_CHANNELS, TCN_BLOCKS


class SE1D(nn.Module):
    """Squeeze-and-Excitation 通道注意力"""

    def __init__(self, ch, r=8):
        super().__init__()
        self.fc = nn.Sequential(
            nn.AdaptiveAvgPool1d(1),
            nn.Conv1d(ch, ch // r, 1), nn.ReLU(inplace=True),
            nn.Conv1d(ch // r, ch, 1), nn.Sigmoid()
        )

    def forward(self, x):  # [B,C,W]
        w = self.fc(x)
        return x * w


class MSBlock(nn.Module):
    """多尺度膨胀卷积块：并联不同 dilation，拼接后 1x1 压缩，含残差+SE"""

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
    主干：MS-TCN 堆叠；可选接一层轻量 Transformer
    """

    def __init__(self, in_dim, n_classes, channels=TCN_CHANNELS, n_blocks=TCN_BLOCKS, dropout=0.1,
                 use_transformer=USE_TRANSFORMER, d_model=128, nhead=4, nlayers=2):
        super().__init__()
        self.stem = nn.Conv1d(in_dim, channels, 1)
        blocks = []
        for _ in range(n_blocks):
            blocks.append(MSBlock(channels, channels, ks=3, dilations=(1, 2, 4, 8), dropout=dropout))
        self.tcn = nn.Sequential(*blocks)
        self.use_tf = use_transformer
        if use_transformer:
            self.proj_in = nn.Conv1d(channels, d_model, 1)
            enc_layer = nn.TransformerEncoderLayer(d_model=d_model, nhead=nhead, dim_feedforward=d_model * 4,
                                                   dropout=0.1, batch_first=True, norm_first=True)
            self.tf = nn.TransformerEncoder(enc_layer, num_layers=nlayers)
            self.proj_out = nn.Conv1d(d_model, channels, 1)
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