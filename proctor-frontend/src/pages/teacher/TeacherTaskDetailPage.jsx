import { useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { api } from "../../apiClient";
import { Button, Card, List, Space, Typography } from "antd";

const { Title, Text } = Typography;

export default function TeacherTaskDetailPage() {
    const { examRoomId } = useParams();
    const navigate = useNavigate();
    const location = useLocation();
    const [students, setStudents] = useState([]);

    useEffect(() => {
        api.get(`/teacher/rooms/${examRoomId}/students`).then((r) => setStudents(r.data?.students || [])).catch(() => setStudents([]));
    }, [examRoomId]);

    return (
        <Card className="glass-effect" variant="borderless" style={{ borderRadius: 16, height: "100%", overflowY: "auto" }}>
            <Space orientation="vertical" size={8} style={{ width: "100%" }}>
                <Button onClick={() => navigate(-1)} style={{ width: "fit-content" }}>← 返回任务列表</Button>
                <Title level={5} style={{ margin: 0 }}>考试详情：{location.state?.examName || "-"}</Title>
                <Text>考场：{location.state?.roomId || examRoomId}</Text>
                <Text>时间：{location.state?.startAt || "-"} ~ {location.state?.endAt || "-"}</Text>
            </Space>
            <List
                style={{ marginTop: 12 }}
                dataSource={students}
                renderItem={(s) => (
                    <List.Item>
                        <Text>{s.studentName}（{s.studentEmail || "-"}）</Text>
                    </List.Item>
                )}
            />
        </Card>
    );
}