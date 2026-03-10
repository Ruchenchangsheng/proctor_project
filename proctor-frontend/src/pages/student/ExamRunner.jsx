import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../../apiClient";
import { Card, Typography, Badge, Space, Alert, Tag } from "antd";
import { VideoCameraOutlined } from "@ant-design/icons";

const { Title, Text } = Typography;

export default function ExamRunner() {
  const { sessionId } = useParams();
  const videoRef = useRef(null);
  const [room, setRoom] = useState(null);
  const [msg, setMsg] = useState("正在连接考场...");

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get(`/student/exams/${sessionId}/room`);
        setRoom(res.data);
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        if (videoRef.current) videoRef.current.srcObject = stream;
        setMsg("监控已开启，请开始答题");
      } catch (e) { setMsg("初始化失败: " + e.message); }
    })();
  }, [sessionId]);

  return (
    <Card className="glass-effect" bordered={false} style={{ borderRadius: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
        <Space direction="vertical">
          <Title level={4}><VideoCameraOutlined /> 考试监控中</Title>
          <Text type="secondary">{room?.examName || "加载中..."}</Text>
        </Space>
        <Badge status="processing" text="AI 实时检测中" />
      </div>
      <video ref={videoRef} playsInline muted autoPlay style={{ width: '100%', borderRadius: 12, background: '#000' }} />
      <Alert message={msg} type="info" showIcon style={{ marginTop: 20 }} />
    </Card>
  );
}