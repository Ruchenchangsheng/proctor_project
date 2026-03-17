// TeacherEvidenceExamsPage 汇总教师可查看的考试证据入口，按考试维度组织异常记录。
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../apiClient";
import { Button, Card, Empty, List, Space, Tag, Typography } from "antd";
import useCatalogTranslation from "../../i18n/useCatalogTranslation";

const { Title, Text } = Typography;

export default function TeacherEvidenceExamsPage() {
    const { tr } = useCatalogTranslation();
    const [tasks, setTasks] = useState([]);
    const [msg, setMsg] = useState("");
    const navigate = useNavigate();

    // 这个 effect 负责在依赖变化时同步加载数据或建立/释放副作用。
    // 阅读时可以重点看依赖数组、内部异步流程以及 return 清理逻辑三部分。
    useEffect(() => {
        api.get("/teacher/invigilations", { params: { phase: "COMPLETED" } })
            .then((r) => setTasks(r.data || []))
            .catch((e) => setMsg(e.message || tr("加载已完成考试失败")));
    }, [tr]);

    const exams = useMemo(() => tasks || [], [tasks]);

    return (
        <Card className="glass-effect" variant="borderless" style={{ borderRadius: 16 }}>
            <Title level={5} style={{ marginTop: 0 }}>{tr("作弊证据 - 已完成考试")}</Title>
            {!!msg && <Text type="danger">{msg}</Text>}
            <List
                locale={{ emptyText: <Empty description={tr("暂无已完成考试")} /> }}
                dataSource={exams}
                renderItem={(exam) => (
                    <List.Item
                        style={{ paddingLeft: "10px" }}
                        actions={[
                            <Button
                                key="view"
                                type="primary"
                                onClick={() => navigate(`/teacher/evidence/exams/${exam.examRoomId}/students`, { state: { examName: exam.examName, roomId: exam.roomId } })}
                            >
                                {tr("查看证据")}
                            </Button>,
                        ]}
                    >
                        <List.Item.Meta
                            title={<Space><span>{exam.examName}</span><Tag color="success">{tr("已完成")}</Tag></Space>}
                            description={(
                                <Space direction="vertical" size={2}>
                                    <Text>{tr("时间")}: {exam.startAt || "-"} - {exam.endAt || "-"}</Text>
                                    <Text>{tr("考场")}: {exam.roomId}</Text>
                                    <Text>{tr("学院/专业")}: {exam.departmentName || "-"} / {exam.majorName || "-"}</Text>
                                </Space>
                            )}
                        />
                    </List.Item>
                )}
            />
        </Card>
    );
}
