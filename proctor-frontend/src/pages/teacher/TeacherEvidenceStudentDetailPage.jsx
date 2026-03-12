import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { api } from "../../apiClient";
import { Button, Card, Empty, List, Space, Tag, Typography } from "antd";

const { Title, Text } = Typography;

function formatTs(ts) {
    const d = new Date(Number(ts) || ts || Date.now());
    if (Number.isNaN(d.getTime())) return "-";
    return d.toLocaleString("zh-CN", { hour12: false });
}

export default function TeacherEvidenceStudentDetailPage() {
    const { examRoomId, studentId } = useParams();
    const location = useLocation();
    const navigate = useNavigate();
    const [items, setItems] = useState([]);
    const [msg, setMsg] = useState("");

    useEffect(() => {
        api.get(`/evidence/rooms/${examRoomId}`)
            .then((r) => setItems(r.data?.items || []))
            .catch((e) => setMsg(e.message || "加载证据详情失败"));
    }, [examRoomId]);

    const list = useMemo(
        () => (items || []).filter((it) => Number(it.studentId) === Number(studentId)).sort((a, b) => Number(b.anomalyTsMs || 0) - Number(a.anomalyTsMs || 0)),
        [items, studentId],
    );

    async function openEvidence(item, mode = "preview") {
        const res = await api.get(`/evidence/${item.evidenceId}/media`, {
            responseType: "blob",
            params: { disposition: mode === "download" ? "attachment" : "inline" },
        });
        const url = URL.createObjectURL(res.data);
        const ext = item.mediaExt || "gif";
        if (mode === "download") {
            const a = document.createElement("a");
            a.href = url;
            a.download = `${item.evidenceId}.${ext}`;
            a.click();
        } else {
            window.open(url, "_blank", "noopener,noreferrer");
        }
        window.setTimeout(() => URL.revokeObjectURL(url), 30000);
    }

    return (
        <Card className="glass-effect" variant="borderless" style={{ borderRadius: 16, height: "100%", overflowY: "auto" }}>
            <Space orientation="vertical" size={8} style={{ width: "100%" }}>
                <Button onClick={() => navigate(-1)} style={{ width: "fit-content" }}>← 返回学生列表</Button>
                <Title level={5} style={{ margin: 0 }}>
                    {location.state?.studentName || `学生#${studentId}`} 的作弊详情（考试：{location.state?.examName || "-"}）
                </Title>
                {!!msg && <Text type="danger">{msg}</Text>}
            </Space>

            <List
                style={{ marginTop: 12 }}
                locale={{ emptyText: <Empty description="该学生暂无作弊证据" /> }}
                dataSource={list}
                renderItem={(item) => (
                    <List.Item
                        actions={[
                            <Button key="preview" onClick={() => openEvidence(item, "preview")}>预览</Button>,
                            <Button key="download" onClick={() => openEvidence(item, "download")}>下载</Button>,
                        ]}
                    >
                        <Space orientation="vertical" size={2}>
                            <Space>
                                <Tag color={String(item.severity).toUpperCase() === "SEVERE" ? "error" : "warning"}>{item.severity || "WARNING"}</Tag>
                                <Tag>{item.anomalyLabel || "unknown"}</Tag>
                                <Tag>{(item.mediaExt || "gif").toUpperCase()}</Tag>
                            </Space>
                            <Text>作弊时间：{formatTs(item.anomalyTsMs || item.anomalyAt)}</Text>
                            <Text type="secondary">证据ID：{item.evidenceId}</Text>
                        </Space>
                    </List.Item>
                )}
            />
        </Card>
    );
}