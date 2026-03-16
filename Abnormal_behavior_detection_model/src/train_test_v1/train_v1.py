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
                # 注意：pos_weight 对正样本项生效
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
        self.log("train/loss", loss, prog_bar=True)
        self.log("train/loss_main", loss_main)
        self.log("train/loss_tv", loss_tv)
        return loss

    def validation_step(self, batch, batch_idx):
        x,y,m = batch
        logits = self(x)
        loss, loss_main, loss_tv = self._criterion(logits, y, m)
        self.val_losses.append(loss.item())

        probs = torch.sigmoid(logits).detach().cpu().numpy()  # [B,W,C]
        y_np  = y.detach().cpu().numpy()
        m_np  = m.detach().cpu().numpy()
        # 拼 batch 为 [N,C]
        probs_flat = probs.reshape(-1, probs.shape[-1])
        y_flat     = y_np.reshape(-1, y_np.shape[-1])
        m_flat     = m_np.reshape(-1)

        mAP, f1_frame = frame_metrics(probs_flat, y_flat, m_flat)
        self.val_f1_frame.append(f1_frame)
        self.val_map.append(mAP)
        self.log("val/loss", loss, prog_bar=True)
        self.log("val/f1_frame", f1_frame, prog_bar=True)
        self.log("val/mAP", mAP, prog_bar=True)

        # 简化的事件级：把拼接后的全序列做事件（严格做法是按视频评估，这里做近似）
        pred_events = probs_to_events(probs_flat, self.labels_key)
        gt_events   = probs_to_events(y_flat, self.labels_key, enter_thr=0.5, exit_thr=0.5)
        _, _, f1_evt = event_f1(pred_events, gt_events, iou_thr=0.5)
        self.val_f1_event.append(f1_evt)
        self.log("val/f1_event", f1_evt, prog_bar=True)
        return {"loss": loss}

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
            plt.plot(self.val_map, label="val_mAP")
            plt.plot(self.val_f1_event, label="val_F1_event")
            plt.xlabel("Val Step"); plt.ylabel("Score"); plt.legend(); plt.tight_layout()
            plt.savefig(os.path.join(PLOTS_DIR, "metrics_curve.png")); plt.close()

        # 生成 PR 曲线（在最后一个验证 batch 的拼接上）
        # 为了更稳定，你也可以在 validation_epoch_end 收集全部再画
        if hasattr(self, "_last_pr_probs"):
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

    def validation_epoch_end(self, outputs):
        # 为 PR 曲线保留最后一个 batch 的拼接数据
        # （也可以在此处合并所有 batch）
        pass

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
    val_ds   = WindowDataset(val_ids)
    train_loader = DataLoader(train_ds, batch_size=BATCH_SIZE, shuffle=True, num_workers=4, drop_last=True)
    val_loader   = DataLoader(val_ds, batch_size=BATCH_SIZE, shuffle=False, num_workers=4)

    # Lightning 模块
    model = LitSeq(in_dim, n_classes, pos_weight=pos_weight, labels_key=labels_key)

    # 回调：最佳检查点、学习率监视、SWA、早停
    ckpt_dir = "runs/hseq"; os.makedirs(ckpt_dir, exist_ok=True)
    ckpt_cb = ModelCheckpoint(dirpath=ckpt_dir, save_top_k=1, monitor="val/f1_event", mode="max", filename="best")
    lr_cb   = LearningRateMonitor(logging_interval='epoch')
    cbs = [ckpt_cb, lr_cb]
    if USE_SWA:
        cbs.append(StochasticWeightAveraging(
            swa_epoch_start=SWA_EPOCH_START,
            swa_lrs=SWA_LR,  # 必填：SWA 学习率
            annealing_epochs=1,  # 可选：SWA between-epochs anneal
            annealing_strategy="cos"  # 可选："cos" / "linear"
        ))
    cbs.append(EarlyStopping(monitor="val/f1_event", patience=8, mode="max"))

    # 训练（TQDM 进度条与日志）
    trainer = pl.Trainer(max_epochs=MAX_EPOCHS, accelerator="auto",
                         default_root_dir=ckpt_dir, callbacks=cbs, log_every_n_steps=10)
    trainer.fit(model, train_loader, val_loader)
    print("[OK] 最佳权重：", ckpt_cb.best_model_path)
    print(f"[OK] 训练曲线/PR 图已输出到：{PLOTS_DIR}/")

if __name__ == "__main__":
    main()
