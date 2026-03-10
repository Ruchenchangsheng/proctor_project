import { useEffect, useRef, useState } from "react";
import { api } from "../../apiClient";
import { useNavigate, useParams } from "react-router-dom";
import { Card, Button, Typography, Space, Spin, Result, Statistic, message } from "antd";
import { CameraOutlined } from "@ant-design/icons";

const { Title, Text } = Typography;

export default function StudentExamVerify() {
  const { sessionId } = useParams();
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [status, setStatus] = useState("idle");
  const [deadline, setDeadline] = useState(0);
  const navigate = useNavigate();

  useEffect(() => {
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } });
        if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play(); }
      } catch (e) { message.error("无法打开摄像头"); }
    })();
    return () => { videoRef.current?.srcObject?.getTracks().forEach(t => t.stop()); };
  }, []);

  async function doVerify() {
    if (!videoRef.current) return;
    setStatus("running");
    try {
      const video = videoRef.current;
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth; canvas.height = video.videoHeight;
      canvas.getContext("2d").drawImage(video, 0, 0);
      const blob = await new Promise(res => canvas.toBlob(res, "image/jpeg", 0.9));
      const fd = new FormData();
      fd.append("photo", blob, "verify.jpg");
      const r = await api.post("/student/verify", fd);
      if (r.data?.passed) {
        setStatus("ok");
        setDeadline(Date.now() + 3000);
      } else {
        setStatus("fail");
        message.error(r.data?.msg || "验证失败");
      }
    } catch (e) { setStatus("fail"); }
  }

  return (
    <Card className="glass-effect" style={{ maxWidth: 800, margin: '40px auto', borderRadius: 16 }}>
      {status === "ok" ? (
        <Result status="success" title="验证通过" subTitle={<Statistic.Countdown value={deadline} format="s 秒后进入考试" onFinish={() => navigate(`/student/exams/${sessionId}/run`)} />} />
      ) : (
        <Space direction="vertical" align="center" style={{ width: '100%' }}>
          <Title level={4}>考试身份核验</Title>
          <video ref={videoRef} playsInline muted style={{ width: '100%', maxWidth: 480, borderRadius: 12, background: '#000' }} />
          <Button type="primary" size="large" icon={<CameraOutlined />} onClick={doVerify} loading={status === "running"}>开始核验</Button>
        </Space>
      )}
    </Card>
  );
}