import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { api } from "../../apiClient";
import { Button, Card, Empty, List, Space, Typography } from "antd";

const { Title, Text } = Typography;

export default function TeacherEvidenceStudentsPage() {
  const { examRoomId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    api.get(`/evidence/rooms/${examRoomId}`)
      .then((r) => setItems(r.data?.items || []))
      .catch((e) => setMsg(e.message || "加载证据失败"));
  }, [examRoomId]);

  const byStudent = useMemo(() => {
    const map = new Map();
    items.forEach((it) => {
      const sid = String(it.studentId || "0");
      const prev = map.get(sid) || { studentId: it.studentId, studentName: it.studentName || `学生#${sid}`, count: 0 };
      prev.count += 1;
      map.set(sid, prev);
    });
    return Array.from(map.values()).sort((a, b) => a.studentId - b.studentId);
  }, [items]);

  return (
    <Card className="glass-effect" variant="borderless" style={{ borderRadius: 16, height: "100%", overflowY: "auto" }}>
      <Space direction="vertical" size={8} style={{ width: "100%" }}>
        <Button onClick={() => navigate(-1)} style={{ width: "fit-content" }}>← 返回考试列表</Button>
        <Title level={5} style={{ margin: 0 }}>考试：{location.state?.examName || "-"}（考场 {location.state?.roomId || examRoomId}）</Title>
        {!!msg && <Text type="danger">{msg}</Text>}
      </Space>

      <List
        style={{ marginTop: 12 }}
        locale={{ emptyText: <Empty description="本场考试暂无作弊证据（全部 0 次）" /> }}
        dataSource={byStudent}
        renderItem={(row) => (
          <List.Item
            actions={[
              <Button
                key="detail"
                type="link"
                onClick={() => navigate(`/teacher/evidence/exams/${examRoomId}/students/${row.studentId}`, {
                  state: {
                    studentName: row.studentName,
                    examName: location.state?.examName,
                    roomId: location.state?.roomId || examRoomId,
                  },
                })}
              >
                查看详情
              </Button>,
            ]}
          >
            <Space style={{ width: "100%", justifyContent: "space-between" }}>
              <Text>{row.studentName}</Text>
              <Text>作弊总次数：{row.count}</Text>
            </Space>
          </List.Item>
        )}
      />
    </Card>
  );
}
