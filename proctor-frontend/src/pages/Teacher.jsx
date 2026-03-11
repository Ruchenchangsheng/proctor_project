import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../apiClient";
import { Button, Card, Empty, List, Modal, Space, Tag, Typography } from "antd";
import { EyeOutlined, VideoCameraOutlined } from "@ant-design/icons";

const { Title, Text } = Typography;

const phaseTabs = [
  { key: "ALL", label: "全部考试", color: "default" },
  { key: "PENDING", label: "待考试", color: "gold" },
  { key: "RUNNING", label: "考试中", color: "processing" },
  { key: "COMPLETED", label: "已完成", color: "success" },
];
const phaseMeta = {
  PENDING: { text: "待考试", color: "gold" },
  RUNNING: { text: "考试中", color: "processing" },
  COMPLETED: { text: "已完成", color: "success" },
};

export default function Teacher() {
  const [profile, setProfile] = useState(null);
  const [phase, setPhase] = useState("ALL");
  const [tasks, setTasks] = useState([]);
  const [msg, setMsg] = useState("");
  const [detail, setDetail] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    api.get("/teacher/profile").then((r) => setProfile(r.data)).catch((e) => setMsg(e.message));
  }, []);

  useEffect(() => {
    loadTasks(phase);
  }, [phase]);

  async function loadTasks(nextPhase) {
    try {
      const params = nextPhase === "ALL" ? {} : { phase: nextPhase };
      const r = await api.get("/teacher/invigilations", { params });
      setTasks(r.data || []);
      setMsg("");
    } catch (e) {
      setMsg(e.message || "加载任务失败");
    }
  }

  function openAction(item) {
    if (item.phase === "RUNNING") {
      navigate(`/teacher/monitor/${item.examRoomId}`, { state: { roomId: item.roomId, examName: item.examName } });
      return;
    }
    setDetail(item);
  }

  const title = useMemo(() => phaseTabs.find((t) => t.key === phase)?.label || "全部考试", [phase]);

    if (!profile) {
    return (
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "8px 0" }}>
        <Card className="glass-effect" variant="borderless">{msg || "加载中..."}</Card>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", display: "grid", gap: 16 }}>
      <Card className="glass-effect" variant="borderless" style={{ borderRadius: 16 }}>
        <Title level={3} style={{ marginTop: 0, marginBottom: 16 }}>👩‍🏫 监考老师主页</Title>
        <Space wrap size={[12, 8]}>
          <Text><b>姓名：</b>{profile.name}</Text>
          <Text><b>学校：</b>{profile.schoolName || "-"}</Text>
          <Text><b>学院：</b>{profile.departmentName || "-"}</Text>
        </Space>
      </Card>

      <Card className="glass-effect" variant="borderless" style={{ borderRadius: 16 }}>
        <Space orientation="vertical" size={12} style={{ width: "100%" }}>
          <Title level={4} style={{ margin: 0 }}>全部监考任务</Title>
          <Space wrap>
            {phaseTabs.map((tab) => (
              <Button
                key={tab.key}
                type={phase === tab.key ? "primary" : "default"}
                onClick={() => setPhase(tab.key)}
              >
                {tab.label}
              </Button>
            ))}
          </Space>
          <Text type="secondary">当前筛选：{title}（共 {tasks?.length || 0} 条）</Text>
        </Space>

        <List
          style={{ marginTop: 12 }}
          locale={{ emptyText: <Empty description="当前筛选下暂无任务" /> }}
          dataSource={tasks}
          renderItem={(item) => {
            const isRunning = item.phase === "RUNNING";
            const meta = phaseMeta[item.phase] || { text: item.phase || "未知", color: "default" };
            return (
              <List.Item
                actions={[
                  <Button 
                  key="action" 
                  type={isRunning ? "primary" : "default"}
                  icon={isRunning ? <VideoCameraOutlined /> : <EyeOutlined />}
                  style={isRunning ? undefined : { background: "rgba(255,255,255,0.95)", borderColor: "#d9d9d9" }}
                  onClick={() => openAction(item)}>
                    {isRunning ? "进入监考" : "查看详情"}
                  </Button>,
                ]}
              >
                <List.Item.Meta
                  title={<Space><span>{item.examName}</span><Tag color={meta.color}>{meta.text}</Tag></Space>}
                  description={(
                    <Space orientation="vertical" size={2}>
                      <Text>时间：{item.startAt || "-"} ~ {item.endAt || "-"}</Text>
                      <Text>学院/专业：{item.departmentName || "-"} / {item.majorName || "-"}</Text>
                      <Text>考场：{item.roomId}（容量 {item.capacity}，当前 {item.studentCount} 人）</Text>
                      {!isRunning && <Text type="secondary">监考老师：{profile.name}</Text>}
                    </Space>
                  )}
                />
              </List.Item>
            );
          }}
          />
          {msg && <Text type="danger">{msg}</Text>}
      </Card>
      <Modal
        open={Boolean(detail)}
        title="监考任务详情"
        onCancel={() => setDetail(null)}
        footer={null}
        styles={{ content: { background: "#ffffff", opacity: 1 } }}
      >
          {detail && (
          <Space orientation="vertical" size={8} style={{ width: "100%" }}>
            <div><b>考试：</b>{detail.examName}</div>
            <div><b>监考老师：</b>{profile.name}</div>
            <div><b>考场：</b>{detail.roomId}</div>
            <div><b>考生名单：</b>{(detail.students || []).map((s) => s.studentName).join("、") || "暂无考生"}</div>
          </Space>
        )}
      </Modal>
    </div>
  );
}
