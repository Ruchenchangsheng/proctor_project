import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../apiClient";
import { Button, Card, Empty, List, Space, Tag, Typography } from "antd";

const { Title, Text } = Typography;

export default function TeacherEvidenceExamsPage() {
    const [tasks, setTasks] = useState([]);
    const [msg, setMsg] = useState("");
    const navigate = useNavigate();

    useEffect(() => {
        api.get("/teacher/invigilations", { params: { phase: "COMPLETED" } })
            .then((r) => setTasks(r.data || []))
            .catch((e) => setMsg(e.message || "加载已完成考试失败"));
    }, []);

    const exams = useMemo(() => tasks || [], [tasks]);

    return (
        <Card className="glass-effect" variant="borderless" style={{ borderRadius: 16, height: "100%", overflowY: "auto" }}>
            <Title level={5} style={{ marginTop: 0 }}>作弊证据 - 已完成考试</Title>
            {!!msg && <Text type="danger">{msg}</Text>}
            <List
                locale={{ emptyText: <Empty description="暂无已完成考试" /> }}
                dataSource={exams}
                renderItem={(exam) => (
                    <List.Item
                        actions={[
                            <Button
                                key="view"
                                type="primary"
                                onClick={() => navigate(`/teacher/evidence/exams/${exam.examRoomId}/students`, { state: { examName: exam.examName, roomId: exam.roomId } })}
                            >
                                查看证据
                            </Button>,
                        ]}
                    >
                        <List.Item.Meta
                            title={<Space><span>{exam.examName}</span><Tag color="success">已完成</Tag></Space>}
                            description={(
                                <Space orientation="vertical" size={2}>
                                    <Text>时间：{exam.startAt || "-"} ~ {exam.endAt || "-"}</Text>
                                    <Text>考场：{exam.roomId}</Text>
                                    <Text>学院/专业：{exam.departmentName || "-"} / {exam.majorName || "-"}</Text>
                                </Space>
                            )}
                        />
                    </List.Item>
                )}
            />
        </Card>
    );
}