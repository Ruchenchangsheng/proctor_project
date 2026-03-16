"""
训练/评估的统一配置
"""

FEATURE_DIR      = "../dataset/features_v1"  # 每个视频的特征缓存：{vid}.npz，内含 feats[T,F], fps
LABELS_NPZ_PATH  = "../dataset/labels_npz/all_labels_v2.npz"
CLEAN_CORPUS     = "../dataset/ann/corpus_clean_v2.json"    # 用于读取视频路径/时长（特征抽取时用）

# 数据对齐
TARGET_FPS       = 30

# 窗口与批次
WIN_SEC          = 8.0     # 训练窗口长度（秒），与线上 2s 决策窗兼容
STEP_SEC         = 2.0     # 窗口步长（秒）
BATCH_SIZE       = 32
MAX_EPOCHS       = 50

# 优化器 & 学习率计划
LR               = 3e-4
WEIGHT_DECAY     = 1e-2
USE_SWA          = True     # 启用 Stochastic Weight Averaging，收敛更稳
SWA_EPOCH_START  = 40
SWA_LR           = LR * 0.1
# 损失与正则
USE_ASL          = True     # 使用 Asymmetric Focal Loss（多标签更友好）
ASL_GAMMA_POS    = 0.0
ASL_GAMMA_NEG    = 2.0
ASL_CLIP         = 0.05
USE_TEMP_SMOOTH  = True     # 时间一致性正则（Total Variation）
TEMP_SMOOTH_W    = 0.02     # 权重（可 0.01~0.05 之间调）

# 事件后处理默认阈值（用于验证集事件级评估，可训练后再扫描）
ENTER_THR        = 0.5
EXIT_THR         = 0.4
MIN_DUR = {
    "look_left":0.3,"look_right":0.3,"look_down":0.3,"look_offscreen":0.3,
    "face_not_visible":0.7,"talking":0.3,"other_person_present":0.3,
    "other_limb_present":0.3,"multi_face":0.3,"leave_seat":3.0
}

# 模型开关
USE_TRANSFORMER  = True     # 开启轻量 Transformer 增强长时依赖
TCN_CHANNELS     = 128
TCN_BLOCKS       = 8
