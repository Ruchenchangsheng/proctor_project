# -*- coding: utf-8 -*-
"""
训练入口：
- 详细中文日志 & 进度条（Lightning + TQDM）
- 帧级/事件级指标实时输出
- 训练结束自动保存曲线图（loss/F1/mAP/PR 曲线）
"""
import os, numpy as np, torch, pytorch_lightning as pl
from torch.utils.data import DataLoader
from torch import nn
from torch.nn import functional as F
from pytorch_lightning.callbacks import ModelCheckpoint, LearningRateMonitor, StochasticWeightAveraging, EarlyStopping
import matplotlib.pyplot as plt
from config import (LABELS_NPZ_PATH, FEATURE_DIR, TARGET_FPS, BATCH_SIZE, MAX_EPOCHS, LR, WEIGHT_DECAY,
                    USE_ASL, ASL_GAMMA_NEG, ASL_GAMMA_POS, ASL_CLIP, USE_TEMP_SMOOTH, TEMP_SMOOTH_W,
                    USE_TRANSFORMER, WIN_SEC, USE_SWA, SWA_EPOCH_START)
from dataset import WindowDataset, split_train_val_ids
from model_seq import HybridSeqModel
from metrics_events import frame_metrics, probs_to_events, event_f1, pr_curve_data
from losses import AsymmetricLoss, temporal_tv_loss
from config import SWA_LR

PLOTS_DIR = "plots"; os.makedirs(PLOTS_DIR, exist_ok=True)

class LitSeq(pl.LightningModule):
    def __init__(self, in_dim, n_classes, pos_weight=None, labels_key=None):
        super().__init__()
        self.save_hyperparameters(ignore=['pos_weight','labels_key'])
        self.model = HybridSeqModel(in_dim, n_classes)
        self.pos_weight = pos_weight
        self.labels_key = labels_key
        # 损失
        self.bce = nn.BCEWithLogitsLoss(reduction='none')
        self.asl = AsymmetricLoss(ASL_GAMMA_POS, ASL_GAMMA_NEG, ASL_CLIP, reduction='none') if USE_ASL else None
        # 记录曲线
        self.tr_losses=[]; self.val_losses=[]
        self.val_f1_frame=[]; self.val_map=[]; self.val_f1_event=[]
        # —— 为兼容 PL2：缓存本轮验证 epoch 的汇总，用于 epoch_end 统一计算/画图 ——
        self._val_probs_batches = []   # 存每个 batch 展平后的 probs
        self._val_targets_batches = [] # 存每个 batch 展平后的 y
        self._val_masks_batches = []   # 存每个 batch 展平后的 mask
        self._last_pr_probs = None     # (probs_flat, y_flat) 供 on_train_end 画 PR

    def configure_optimizers(self):
        opt = torch.optim.AdamW(self.parameters(), lr=LR, weight_decay=WEIGHT_DECAY)
        sch = torch.optim.lr_scheduler.CosineAnnealingLR(opt, T_max=MAX_EPOCHS)
        return {"optimizer": opt, "lr_scheduler": sch}

    def forward(self, x):   # x:[B,W,F]
        return self.model(x)  # logits:[B,W,C]

    def _criterion(self, logits, y, m):
        """
        组合损失：
        - 主损失：ASL 或 BCE（多标签）
        - 忽略段 mask
        - 时间一致性正则（控制抖动）
        """
        if self.asl is not None:
            loss = self.asl(logits, y)  # [B,W,C]
        else:
            loss = self.bce(logits, y)  # [B,W,C]
            if self.pos_weight is not None:
                # BCE 不直接支持 pos_weight per-batch 的 none reduction，这里手动乘
                pw = self.pos_weight.to(logits.device)[None,None,:]  # [1,1,C]
                pos_mask = (y > 0.5).float()
                loss = loss * (1 + (pw-1)*pos_mask)
        # mask ignore
        m3 = m.unsqueeze(-1)
        loss_main = (loss * m3).sum() / torch.clamp(m3.sum(), min=1.0)
        loss_tv = temporal_tv_loss(logits, m, weight=TEMP_SMOOTH_W if USE_TEMP_SMOOTH else 0.0)
        return loss_main + loss_tv, loss_main.detach(), loss_tv.detach()

    def training_step(self, batch, batch_idx):
        x,y,m = batch
        logits = self(x)
        loss, loss_main, loss_tv = self._criterion(logits, y, m)
        self.tr_losses.append(loss.item())
        self.log("train/loss", loss, prog_bar=True, on_step=True, on_epoch=True, batch_size=x.shape[0])
        self.log("train/loss_main", loss_main, on_step=True, on_epoch=True, batch_size=x.shape[0])
        self.log("train/loss_tv", loss_tv, on_step=True, on_epoch=True, batch_size=x.shape[0])
        return loss

    # —— 每轮验证开始时，清空缓存（PL2 推荐做法）——
    def on_validation_epoch_start(self):
        self._val_probs_batches.clear()
        self._val_targets_batches.clear()
        self._val_masks_batches.clear()

    def validation_step(self, batch, batch_idx):
        x,y,m = batch
        logits = self(x)
        loss, loss_main, loss_tv = self._criterion(logits, y, m)
        self.val_losses.append(loss.item())

        probs = torch.sigmoid(logits).detach().cpu().numpy()  # [B,W,C]
        y_np  = y.detach().cpu().numpy()
        m_np  = m.detach().cpu().numpy()

        # 展平到 [N,C] / [N]，便于帧级指标
        probs_flat = probs.reshape(-1, probs.shape[-1])
        y_flat     = y_np.reshape(-1, y_np.shape[-1])
        m_flat     = m_np.reshape(-1)

        # —— 缓存到 epoch buffer，供 on_validation_epoch_end 汇总使用 ——
        self._val_probs_batches.append(probs_flat)
        self._val_targets_batches.append(y_flat)
        self._val_masks_batches.append(m_flat)

        # 在线帧级指标（与你原逻辑一致）
        mAP, f1_frame = frame_metrics(probs_flat, y_flat, m_flat)
        self.val_f1_frame.append(f1_frame)
        self.val_map.append(mAP)
        self.log("val/loss", loss, prog_bar=True, on_step=True, on_epoch=False, batch_size=x.shape[0])
        self.log("val/f1_frame", f1_frame, prog_bar=True, on_step=True, on_epoch=False, batch_size=x.shape[0])
        self.log("val/mAP", mAP, prog_bar=True, on_step=True, on_epoch=False, batch_size=x.shape[0])

        # 事件级（近似）：把当下 batch 展平后转事件评估（与你原逻辑保持一致）
        pred_events = probs_to_events(probs_flat, self.labels_key)
        gt_events   = probs_to_events(y_flat, self.labels_key, enter_thr=0.5, exit_thr=0.5)
        _, _, f1_evt = event_f1(pred_events, gt_events, iou_thr=0.5)
        self.val_f1_event.append(f1_evt)
        self.log("val/f1_event", f1_evt, prog_bar=True, on_step=True, on_epoch=False, batch_size=x.shape[0])

        # 为 on_train_end 的 PR 曲线准备"最后一个 batch"的数据（保持你原注释意图）
        self._last_pr_probs = (probs_flat, y_flat)

        return {"loss": loss}

    # —— 兼容 PL2：用该钩子替代旧的 validation_epoch_end ——
    def on_validation_epoch_end(self):
        """
        将本轮验证的所有 batch 进行一次性汇总（保持你原先度量口径，只是位置换到这里）。
        这里不改变原有在线日志，只是额外把 epoch 聚合值再 log 一次，便于看曲线。
        """
        if len(self._val_probs_batches) == 0:
            return
        probs_flat = np.concatenate(self._val_probs_batches, axis=0)
        y_flat     = np.concatenate(self._val_targets_batches, axis=0)
        m_flat     = np.concatenate(self._val_masks_batches, axis=0)

        # 帧级汇总
        mAP_epoch, f1_frame_epoch = frame_metrics(probs_flat, y_flat, m_flat)
        self.log("val/mAP_epoch", mAP_epoch, prog_bar=True, on_epoch=True, sync_dist=False)
        self.log("val/f1_frame_epoch", f1_frame_epoch, prog_bar=True, on_epoch=True, sync_dist=False)

        # 事件级（近似）汇总
        pred_events = probs_to_events(probs_flat, self.labels_key)
        gt_events   = probs_to_events(y_flat, self.labels_key, enter_thr=0.5, exit_thr=0.5)
        _, _, f1_evt_epoch = event_f1(pred_events, gt_events, iou_thr=0.5)
        self.log("val/f1_event_epoch", f1_evt_epoch, prog_bar=True, on_epoch=True, sync_dist=False)

        # 同时把 PR 曲线用的最后一批数据也保留（若你更想用"整轮汇总"的 PR，可把这行改成 probs_flat,y_flat）
        self._last_pr_probs = (probs_flat, y_flat)

    def on_train_end(self):
        # 保存训练/验证曲线
        epochs = max(1, len(self.tr_losses))
        plt.figure(figsize=(6,4))
        plt.plot(self.tr_losses, label="train_loss", alpha=0.8)
        if self.val_losses:
            plt.plot(self.val_losses, label="val_loss", alpha=0.8)
        plt.xlabel("Step"); plt.ylabel("Loss"); plt.legend(); plt.tight_layout()
        plt.savefig(os.path.join(PLOTS_DIR, "loss_curve.png")); plt.close()

        if self.val_f1_frame:
            plt.figure(figsize=(6,4))
            plt.plot(self.val_f1_frame, label="val_F1_frame")
            plt.plot(self.val_map, label="val_Micro/mAP")  # 名称不改算法，只是更直观
            plt.plot(self.val_f1_event, label="val_F1_event")
            plt.xlabel("Val Step"); plt.ylabel("Score"); plt.legend(); plt.tight_layout()
            plt.savefig(os.path.join(PLOTS_DIR, "metrics_curve.png")); plt.close()

        # 生成 PR 曲线（使用 _last_pr_probs）
        if self._last_pr_probs is not None:
            probs_flat, y_flat = self._last_pr_probs
            pr = pr_curve_data(probs_flat, y_flat, self.labels_key)
            for name, (p,r,th) in pr.items():
                plt.figure(figsize=(5,4))
                plt.plot(r, p)
                plt.xlabel("Recall"); plt.ylabel("Precision")
                plt.title(f"PR: {name}")
                plt.tight_layout()
                plt.savefig(os.path.join(PLOTS_DIR, f"pr_{name}.png"))
                plt.close()

def compute_pos_weight(labels_npz_path=LABELS_NPZ_PATH):
    pack = np.load(labels_npz_path, allow_pickle=True)
    labels_key = [k for k in pack["labels_key"]]
    C = len(labels_key)
    pos = np.zeros(C, np.float64); neg = np.zeros(C, np.float64)
    vids = sorted(set([k.split("__")[0] for k in pack.files if k.endswith("__labels")]))
    for vid in vids:
        y = pack[f"{vid}__labels"]
        m = pack[f"{vid}__mask"][:,None]
        pos += (y*m).sum(axis=0)
        neg += ((1-y)*m).sum(axis=0)
    pos_weight = (neg / np.maximum(1.0, pos)).astype(np.float32)
    return torch.from_numpy(pos_weight), labels_key



def custom_collate_fn(batch):
    """
    处理不同长度序列的自定义collate函数
    """
    xs, ys, ms = [], [], []

    for x, y, m in batch:
        xs.append(x)
        ys.append(y)
        ms.append(m)

    # 直接stack，让PyTorch处理填充
    try:
        xs_stacked = torch.stack(xs)
        ys_stacked = torch.stack(ys)
        ms_stacked = torch.stack(ms)
    except RuntimeError as e:
        # 如果stack失败，说明形状不一致，需要手动处理
        print(f"[WARN] 自动stack失败: {e}")
        print(f"[WARN] 样本形状: {[x.shape for x in xs]}")

        # 找到最大长度
        max_len = max(x.shape[0] for x in xs)

        # 手动填充所有样本
        xs_padded = []
        ys_padded = []
        ms_padded = []

        for x, y, m in batch:
            pad_len = max_len - x.shape[0]
            if pad_len > 0:
                x = F.pad(x, (0, 0, 0, pad_len), mode='constant', value=0)
                y = F.pad(y, (0, 0, 0, pad_len), mode='constant', value=0)
                m = F.pad(m, (0, pad_len), mode='constant', value=0)
            xs_padded.append(x)
            ys_padded.append(y)
            ms_padded.append(m)

        xs_stacked = torch.stack(xs_padded)
        ys_stacked = torch.stack(ys_padded)
        ms_stacked = torch.stack(ms_padded)

    return xs_stacked, ys_stacked, ms_stacked


def main():
    # 计算类别权重，缓解类不平衡
    pos_weight, labels_key = compute_pos_weight()

    # 划分（建议实际用 cross-subject）
    train_ids, val_ids = split_train_val_ids()

    # 确定输入维度
    import glob
    any_feat = np.load(glob.glob(os.path.join(FEATURE_DIR, "*.npz"))[0])
    in_dim = any_feat["feats"].shape[1]
    n_classes = len(labels_key)

    # 数据集/加载器
    train_ds = WindowDataset(train_ids)
    val_ds = WindowDataset(val_ids)
    train_loader = DataLoader(train_ds, batch_size=BATCH_SIZE, shuffle=True, num_workers=0, drop_last=True)
    val_loader = DataLoader(val_ds, batch_size=BATCH_SIZE, shuffle=False, num_workers=0)

    # Lightning 模块
    model = LitSeq(in_dim, n_classes, pos_weight=pos_weight, labels_key=labels_key)

    # 回调：最佳检查点、学习率监视、SWA、早停
    ckpt_dir = "runs/hseq";
    os.makedirs(ckpt_dir, exist_ok=True)
    ckpt_cb = ModelCheckpoint(dirpath=ckpt_dir, save_top_k=1, monitor="val/f1_event_epoch", mode="max", filename="best")
    lr_cb = LearningRateMonitor(logging_interval='epoch')
    cbs = [ckpt_cb, lr_cb]
    if USE_SWA:
        cbs.append(StochasticWeightAveraging(
            swa_epoch_start=SWA_EPOCH_START,
            swa_lrs=SWA_LR,
            annealing_epochs=1,
            annealing_strategy="cos"
        ))

    # 修复：使用正确的指标名称
    cbs.append(EarlyStopping(monitor="val/f1_event_epoch", patience=8, mode="max"))

    # 训练（TQDM 进度条与日志）
    trainer = pl.Trainer(
        max_epochs=MAX_EPOCHS,
        accelerator="auto",
        default_root_dir=ckpt_dir,
        callbacks=cbs,
        log_every_n_steps=10,
        num_sanity_val_steps=0  # 禁用完整性检查以加速
    )
    trainer.fit(model, train_loader, val_loader)
    print("[OK] 最佳权重：", ckpt_cb.best_model_path)
    print(f"[OK] 训练曲线/PR 图已输出到：{PLOTS_DIR}/")

if __name__ == "__main__":
    main()