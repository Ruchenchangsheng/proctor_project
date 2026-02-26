# -*- coding: utf-8 -*-
"""
人脸识别服务（FastAPI）
- /health   健康检查
- /embed    输入单张人脸照片，输出 ArcFace 512 维向量 + 人脸检测质量信息（det、bbox、size）
- /verify   输入待验证帧 + 目标向量（字符串JSON数组），返回 1:1 验证相似度与阈值判断结果

说明：
- 使用 InsightFace 预训练套件 buffalo_l（RetinaFace + ArcFace）
- 默认 CPUExecutionProvider；如有 NVIDIA GPU，可安装 onnxruntime-gpu 并改为 CUDAExecutionProvider
- 返回 det_score 与 bbox/size，便于后端做“注册质量门控”（清晰正脸、人脸尺寸等）
"""

from fastapi import FastAPI, File, UploadFile, Form
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import numpy as np
import cv2
from insightface.app import FaceAnalysis

app = FastAPI(title="FaceSvc", version="1.1.0")

# 允许跨域（开发期方便调试）
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], allow_methods=["*"], allow_headers=["*"]
)

# 初始化 InsightFace
# 说明：第一次运行会自动下载模型（需要联网）
# providers 可改为 ["CUDAExecutionProvider", "CPUExecutionProvider"] 以启用 GPU
face_app = FaceAnalysis(name="buffalo_l", providers=["CPUExecutionProvider"])
face_app.prepare(ctx_id=0, det_size=(640, 640))


def imread_bgr(data: bytes):
    """将二进制图像解码为 OpenCV BGR 格式"""
    arr = np.frombuffer(data, np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("image decode failed")
    return img


@app.get("/health")
def health():
    """健康检查"""
    return {"ok": True}


@app.post("/embed")
async def embed(file: UploadFile = File(...)):
    """
    输入：单张人脸照片
    输出：
      - ok: 是否成功检测到人脸
      - embedding: 512维 L2 归一化的人脸向量（列表）
      - det: 检测置信度（0-1）
      - bbox: [x1, y1, x2, y2]
      - size: {w, h} 人脸框宽高（像素）
    """
    img = imread_bgr(await file.read())
    faces = face_app.get(img)
    if not faces:
        return {"ok": False, "msg": "no face"}
    faces.sort(key=lambda f: float(f.det_score), reverse=True)
    f = faces[0]
    x1, y1, x2, y2 = [int(v) for v in f.bbox]
    w, h = x2 - x1, y2 - y1
    return {
        "ok": True,
        "embedding": f.normed_embedding.tolist(),  # 512D, 已 L2 归一化
        "det": float(f.det_score),
        "bbox": [x1, y1, x2, y2],
        "size": {"w": int(w), "h": int(h)}
    }


class VerifyResp(BaseModel):
    ok: bool
    score: float
    threshold: float


@app.post("/verify", response_model=VerifyResp)
async def verify(
    file: UploadFile = File(...),
    target: str = Form(...),             # 目标向量（字符串形式的 JSON 数组："[...]"）
    threshold: float = Form(0.35)
):
    """
    输入：当前帧 + 目标向量(JSON数组字符串) + 阈值
    输出：是否通过、相似度分数、阈值
    """
    img = imread_bgr(await file.read())
    faces = face_app.get(img)
    if not faces:
        return VerifyResp(ok=False, score=0.0, threshold=threshold)
    faces.sort(key=lambda f: float(f.det_score), reverse=True)
    curr = faces[0].normed_embedding  # 已 L2 归一化 → 用点积即为余弦相似度
    # 将 "[...]" 转为 numpy 数组
    tgt = np.array(np.fromstring(target.strip("[]"), sep=","), dtype=np.float32)
    if tgt.shape != curr.shape:
        return VerifyResp(ok=False, score=0.0, threshold=threshold)
    score = float(np.dot(curr, tgt))  # cosine since both normalized
    return VerifyResp(ok=(score >= threshold), score=score, threshold=threshold)
