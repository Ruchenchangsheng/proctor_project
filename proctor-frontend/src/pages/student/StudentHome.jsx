import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../apiClient";
import { Table, Card, Typography, Image, Button, Tag, Space, Descriptions, message, Spin } from "antd";
import { LoginOutlined } from "@ant-design/icons";

const { Title, Text } = Typography;

export default function StudentHome() {
  const [p, setP] = useState(null);
  const [photoUrl, setPhotoUrl] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    (async () => {
      try {
        const r = await api.get("/student/profile");
        setP(r.data);
        const exams = await api.get("/student/exams");
        setSessions(exams.data || []);
        try {
          const img = await api.get("/student/photo", { responseType: "blob" });
          if (img.status !== 204) {
            const url = URL.createObjectURL(img.data);
            setPhotoUrl(url);
          }
        } catch (e) { setPhotoUrl(null); }
      } catch (e) {
        message.error("加载数据失败: " + e.message);
      } finally { setLoading(false); }
    })();
  }, []);

  if (loading) return <div style={{ textAlign: 'center', marginTop: '20vh' }}><Spin size="large" tip="加载中..." /></div>;

  const columns = [
    { title: "考试名称", dataIndex: "examName", key: "examName", render: text => <Text strong>{text}</Text> },
    { title: "开始时间", dataIndex: "startAt", key: "startAt" },
    { title: "考场", dataIndex: "roomId", key: "roomId", render: text => <Tag color="blue">{text || "-"}</Tag> },
    {
      title: "状态",
      dataIndex: "phase",
      key: "phase",
      render: phase => (
        <Tag color={phase === "RUNNING" ? "green" : phase === "COMPLETED" ? "default" : "orange"}>
          {phase === "RUNNING" ? "进行中" : phase === "COMPLETED" ? "已结束" : "待开始"}
        </Tag>
      )
    },
    {
      title: "操作",
      key: "action",
      render: (_, record) => (
        <Button
          type="primary"
          icon={<LoginOutlined />}
          disabled={record.phase === "COMPLETED"}
          onClick={() => navigate(`/student/exams/${record.sessionId}/verify`)} // 修正路径
        >
          进入考试
        </Button>
      )
    },
  ];

  return (
    <Space orientation="vertical" size="large" style={{ width: '100%' }}>
      <Card className="glass-effect" variant={false} style={{ borderRadius: 16 }}>
        <Title level={3}>🎓 考生主页</Title>
        <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap' }}>
          <Image width={120} height={160} src={photoUrl} fallback="https://via.placeholder.com/120x160?text=无照片" style={{ borderRadius: 8, objectFit: 'cover' }} />
          <Descriptions column={{ xs: 1, sm: 2 }} style={{ flex: 1 }}>
            <Descriptions.Item label="姓名"><Text strong>{p?.name}</Text></Descriptions.Item>
            <Descriptions.Item label="学校">{p?.schoolName}</Descriptions.Item>
            <Descriptions.Item label="学院">{p?.departmentName}</Descriptions.Item>
            <Descriptions.Item label="专业">{p?.majorName || "-"}</Descriptions.Item>
          </Descriptions>
        </div>
      </Card>
      <Card className="glass-effect" variant={false} style={{ borderRadius: 16 }}>
        <Table dataSource={sessions} columns={columns} rowKey="sessionId" pagination={false} style={{ background: 'transparent' }} />
      </Card>
    </Space>
  );
}