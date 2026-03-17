// TeacherTasksPage 展示教师监考任务列表，并按待开始、进行中和已完成等阶段筛选。
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../apiClient";
import { Button, Card, Empty, List, Space, Tag, Typography } from "antd";
import { useTranslation } from "react-i18next";
import { translateSourceText } from "../../i18n/catalog";

const { Text, Title } = Typography;

const phaseMeta = {
    ALL: { text: "全部考试", color: "default" },
    PENDING: { text: "待考试", color: "gold" },
    RUNNING: { text: "考试中", color: "processing" },
    COMPLETED: { text: "已完成", color: "success" },
};

export default function TeacherTasksPage({ phase = "ALL" }) {
    const { i18n } = useTranslation();
    const [tasks, setTasks] = useState([]);
    const [msg, setMsg] = useState("");
    const navigate = useNavigate();
    const translate = (text) => translateSourceText(text, i18n.language);

    // 这个 effect 负责在依赖变化时同步加载数据或建立/释放副作用。
    // 阅读时可以重点看依赖数组、内部异步流程以及 return 清理逻辑三部分。
    useEffect(() => {
        const params = phase === "ALL" ? {} : { phase };
        api.get("/teacher/invigilations", { params })
            .then((r) => setTasks(r.data || []))
            .catch((e) => setMsg(e.message || "加载监考任务失败"));
    }, [phase]);

    const title = useMemo(() => phaseMeta[phase]?.text || "监考任务", [phase]);

    return (
        <Card className="glass-effect" variant="borderless" style={{ borderRadius: 16 }}>
            <Title level={5} style={{ marginTop: 0 }}>{translate(title)}</Title>
            {!!msg && <Text type="danger">{msg}</Text>}
            <List
                locale={{ emptyText: <Empty description={translate("当前筛选下暂无任务")} /> }}
                dataSource={tasks}
                renderItem={(item) => {
                    const p = item.phase || "PENDING";
                    const meta = phaseMeta[p] || phaseMeta.PENDING;
                    const canMonitor = p === "RUNNING";
                    const isCompleted = p === "COMPLETED";
                    return (
                        <List.Item
                            style={{ paddingLeft: "10px" }}
                            actions={[
                                canMonitor ? (
                                    <Button type="primary" key="monitor" onClick={() => navigate(`/teacher/monitor/${item.examRoomId}`, { state: { roomId: item.roomId, examName: item.examName } })}>{translate("进入监考")}</Button>
                                ) : null,
                                isCompleted ? (
                                    <Button key="detail" onClick={() => navigate(`/teacher/tasks/${item.examRoomId}/detail`, { state: item })}>{translate("查看详情")}</Button>
                                ) : null,
                            ].filter(Boolean)}
                        >
                            <List.Item.Meta
                                title={<Space><span>{item.examName}</span><Tag color={meta.color}>{translate(meta.text)}</Tag></Space>}
                                description={(
                                    <Space orientation="vertical" size={2}>
                                        <Text>{translate("时间")}: {item.startAt || "-"} - {item.endAt || "-"}</Text>
                                        <Text>{translate("学院/专业")}: {item.departmentName || "-"} / {item.majorName || "-"}</Text>
                                        <Text>{translate("考场")}: {item.roomId} ({translate("容量")} {item.capacity}, {translate("当前")} {item.studentCount} {translate("人")})</Text>
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
