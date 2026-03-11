import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../apiClient";
import { Button, Card, Empty, List, Space, Tag, Typography } from "antd";

const { Text, Title } = Typography;

const phaseMeta = {
  ALL: { text: "全部考试", color: "default" },
  PENDING: { text: "待考试", color: "gold" },
  RUNNING: { text: "考试中", color: "processing" },
  COMPLETED: { text: "已完成", color: "success" },
};

export default function TeacherTasksPage({ phase = "ALL" }) {
  const [tasks, setTasks] = useState([]);
  const [msg, setMsg] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    const params = phase === "ALL" ? {} : { phase };
    api.get("/teacher/invigilations", { params })
      .then((r) => setTasks(r.data || []))
      .catch((e) => setMsg(e.message || "加载监考任务失败"));
  }, [phase]);

  const title = useMemo(() => phaseMeta[phase]?.text || "监考任务", [phase]);

  return (
    <Card className="glass-effect" variant="borderless" style={{ borderRadius: 16, height: "100%", overflowY: "auto" }}>
      <Title level={5} style={{ marginTop: 0 }}>{title}</Title>
      {!!msg && <Text type="danger">{msg}</Text>}
      <List
        locale={{ emptyText: <Empty description="当前筛选下暂无任务" /> }}
        dataSource={tasks}
        renderItem={(item) => {
          const p = item.phase || "PENDING";
          const meta = phaseMeta[p] || phaseMeta.PENDING;
          const canMonitor = p === "RUNNING";
          return (
            <List.Item
              actions={[
                canMonitor ? (
                  <Button type="primary" key="monitor" onClick={() => navigate(`/teacher/monitor/${item.examRoomId}`, { state: { roomId: item.roomId, examName: item.examName } })}>进入监考</Button>
                ) : null,
              ].filter(Boolean)}
            >
              <List.Item.Meta
                title={<Space><span>{item.examName}</span><Tag color={meta.color}>{meta.text}</Tag></Space>}
                description={(
                  <Space direction="vertical" size={2}>
                    <Text>时间：{item.startAt || "-"} ~ {item.endAt || "-"}</Text>
                    <Text>学院/专业：{item.departmentName || "-"} / {item.majorName || "-"}</Text>
                    <Text>考场：{item.roomId}（容量 {item.capacity}，当前 {item.studentCount} 人）</Text>
                  </Space>
                )}
              />
            </List.Item>
          );
        }}
      />
    </Card>
  );
}
