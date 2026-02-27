# proctor_project

## 实时异常检测接入（30fps / 8s窗口 / 2s步进）

### 1) FastAPI 接口定义

#### `POST /anomaly/frame`
- 入参（`multipart/form-data`）
  - `file`: 当前视频帧（jpg/png）
  - `room_id`: 考场ID
  - `student_id`: 考生ID
  - `ts_ms`: 帧时间戳（毫秒）
- 返回
```json
{
  "ok": true,
  "fps": 30,
  "window_sec": 8,
  "step_sec": 2,
  "events": [
    {
      "type": "enter",
      "label": "abnormal_posture",
      "ts_ms": 1730000000000,
      "score": 0.83,
      "min_dur_ms": 2000
    },
    {
      "type": "exit",
      "label": "abnormal_posture",
      "ts_ms": 1730000002500,
      "score": 0.21,
      "duration_ms": 2500,
      "min_dur_ms": 2000
    }
  ]
}
```

> 说明：
> - 时序参数由服务内部固定（30fps、8秒窗口、2秒步进）
> - 支持双后端：ONNX 与 PyTorch
> - `ANOMALY_MODEL_BACKEND=auto|onnx|torch`
> - `ANOMALY_MODEL_PATH` 支持 `.onnx/.pt/.pth/.ckpt`
> - 若是 `.ckpt/.pth` 的 state_dict，需要配置 `ANOMALY_TORCH_CLASS_PATH=包路径:模型类名`（可选 `ANOMALY_TORCH_CLASS_KWARGS`）
> - 特征优先使用 MediaPipe（Face Mesh/Pose/Selfie Segmentation），不可用时自动降级

### 2) Java 侧调用

- `StudentController` 在接收学生帧 `/api/student/exams/{sessionId}/frame` 后：
  1. 继续写入 `ExamLiveStateService`（兼容旧逻辑）
  2. 调用 `AnomalyClient.detect(...)` 转发到 FastAPI `/anomaly/frame`
  3. 调用 `AnomalyEventService.mergeEvents(...)` 处理 `enter/exit/min_dur` 事件

- 教师端新增接口：
  - `GET /api/teacher/rooms/{examRoomId}/alerts`
  - 返回：
    - `active`: 当前进行中的异常状态
    - `events`: 已完成的事件级告警（满足最小时长）

### 3) 前端展示

- 学生端 `ExamRunner`：
  - WebRTC 实时推流给老师
  - 并行以约 `33ms` 间隔（目标30fps）上传压缩帧到 `/api/student/exams/{sessionId}/frame` 供异常检测

- 教师端 `TeacherMonitor`：
  - 右侧“异常状态（实时）”区域每2秒轮询 `/api/teacher/rooms/{examRoomId}/alerts`
  - 显示：
    - 进行中异常（active）
    - 事件告警列表（events，含 enter/exit/min_dur结果）

### 4) 联调命令

#### 启动 FastAPI（8000）
```bash
cd vision-recognition-service
pip install -r requirements.txt
# 双后端示例（ONNX）
# export ANOMALY_MODEL_BACKEND=onnx
# export ANOMALY_MODEL_PATH=/models/best.onnx
# 双后端示例（PyTorch）
# export ANOMALY_MODEL_BACKEND=torch
# export ANOMALY_MODEL_PATH=/models/best.ckpt
# export ANOMALY_TORCH_CLASS_PATH=my_pkg.models.ms_tcn:Model
# export ANOMALY_TORCH_CLASS_KWARGS=in_dim=6,num_classes=2
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

#### 启动 Java（8080）
```bash
cd proctor_backend
# application.properties 中 anomaly.base 默认 http://localhost:8000
mvn spring-boot:run
```

#### 启动前端（5173）
```bash
cd proctor_frontend
npm install
npm run dev
```

#### 快速验证异常接口
```bash
curl -X POST http://localhost:8000/anomaly/frame \
  -F file=@test.jpg \
  -F room_id=1 \
  -F student_id=1001 \
  -F ts_ms=$(date +%s%3N)
```
