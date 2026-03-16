import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useOutletContext, useParams } from "react-router-dom";
import { api } from "../../apiClient";
import { Button, Card, Empty, Form, Input, List, Modal, Select, Space, Tag, Typography, message } from "antd";
import { opaqueWhiteModalProps } from "./modalStyles";
import useCatalogTranslation from "../../i18n/useCatalogTranslation";

const { Title, Text } = Typography;

function formatTs(value, locale) {
  if (value === null || value === undefined || value === "") return "-";
  const date = new Date(Number(value) || value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString(locale, { hour12: false });
}

function reviewTag(value, tr) {
  switch (value) {
    case "CONFIRMED_CHEATING":
      return <Tag color="error">{tr("确认作弊")}</Tag>;
    case "FALSE_POSITIVE":
      return <Tag color="default">{tr("误报")}</Tag>;
    case "REVIEWED":
      return <Tag color="processing">{tr("已核查")}</Tag>;
    default:
      return <Tag color="warning">{tr("待处理")}</Tag>;
  }
}

export default function SchoolEvidenceStudentDetailPage() {
  const { school } = useOutletContext();
  const { tr, locale } = useCatalogTranslation();
  const { examId, studentId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [msg, setMsg] = useState("");
  const [reviewing, setReviewing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();
  const reviewOptions = [
    { value: "PENDING", label: tr("待处理") },
    { value: "REVIEWED", label: tr("已核查") },
    { value: "FALSE_POSITIVE", label: tr("误报") },
    { value: "CONFIRMED_CHEATING", label: tr("确认作弊") },
  ];

  useEffect(() => {
    if (!school?.id) return;
    load();
  }, [school?.id, examId, studentId]);

  async function load() {
    try {
      const r = await api.get(`/evidence/school/${school.id}`);
      setItems(r.data?.items || []);
      setMsg("");
    } catch (e) {
      setMsg(e.message || tr("加载证据详情失败"));
    }
  }

  const list = useMemo(
    () => (items || [])
      .filter((item) => Number(item.examId) === Number(examId) && Number(item.studentId) === Number(studentId))
      .sort((a, b) => Number(b.anomalyTsMs || 0) - Number(a.anomalyTsMs || 0)),
    [items, examId, studentId],
  );

  async function openEvidence(item, mode = "preview") {
    const res = await api.get(`/evidence/${item.evidenceId}/media`, {
      responseType: "blob",
      params: { disposition: mode === "download" ? "attachment" : "inline" },
    });
    const url = URL.createObjectURL(res.data);
    if (mode === "download") {
      const a = document.createElement("a");
      a.href = url;
      a.download = `${item.evidenceId}.${item.mediaExt || "mp4"}`;
      a.click();
    } else {
      window.open(url, "_blank", "noopener,noreferrer");
    }
    window.setTimeout(() => URL.revokeObjectURL(url), 30000);
  }

  async function exportList() {
    try {
      const res = await api.post("/evidence/export-list", { evidenceIds: list.map((item) => item.evidenceId) }, { responseType: "blob" });
      downloadBlob(res.data, `evidence-list-${examId}-${studentId}.csv`);
    } catch (e) {
      message.error(e.message || tr("导出证据列表失败"));
    }
  }

  async function exportZip() {
    try {
      const res = await api.post("/evidence/export-zip", { evidenceIds: list.map((item) => item.evidenceId) }, { responseType: "blob" });
      downloadBlob(res.data, `evidences-${examId}-${studentId}.zip`);
    } catch (e) {
      message.error(e.message || tr("批量下载证据失败"));
    }
  }

  async function exportReport(item) {
    try {
      const res = await api.get(`/evidence/${item.evidenceId}/report`, { responseType: "blob" });
      downloadBlob(res.data, `evidence-report-${item.evidenceId}.txt`);
    } catch (e) {
      message.error(e.message || tr("导出处理报告失败"));
    }
  }

  function startReview(item) {
    setReviewing(item);
    form.setFieldsValue({
      reviewStatus: item.reviewStatus || "PENDING",
      reviewNote: item.reviewNote || "",
    });
  }

  async function submitReview(values) {
    if (!reviewing?.evidenceId) return;
    setSaving(true);
    try {
      await api.post(`/evidence/${reviewing.evidenceId}/review`, values);
      message.success(tr("证据处理结果已保存"));
      setReviewing(null);
      form.resetFields();
      await load();
    } catch (e) {
      message.error(e.message || tr("保存处理结果失败"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="glass-effect" variant="borderless" style={{ borderRadius: 16, height: "100%", overflowY: "auto" }}>
      <Space direction="vertical" size={12} style={{ width: "100%" }}>
        <Button onClick={() => navigate(-1)} style={{ width: "fit-content" }}>{tr("← 返回学生列表")}</Button>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div>
            <Title level={4} style={{ margin: 0 }}>
              {tr(`${location.state?.studentName || `学生#${studentId}`} 的作弊证据`)}
            </Title>
            <Text type="secondary">{tr("考试")}: {location.state?.examName || tr(`考试#${examId}`)}</Text>
          </div>
          <Space wrap>
            <Button onClick={exportList} disabled={!list.length}>{tr("导出证据列表")}</Button>
            <Button type="primary" onClick={exportZip} disabled={!list.length}>{tr("批量下载证据")}</Button>
          </Space>
        </div>
        {!!msg && <Text type="danger">{msg}</Text>}
      </Space>

      <List
        style={{ marginTop: 16 }}
        locale={{ emptyText: <Empty description={tr("该学生暂无作弊证据")} /> }}
        dataSource={list}
        renderItem={(item) => (
          <List.Item
            actions={[
              <Button key="preview" onClick={() => openEvidence(item, "preview")}>{tr("预览")}</Button>,
              <Button key="download" onClick={() => openEvidence(item, "download")}>{tr("下载")}</Button>,
              <Button key="report" onClick={() => exportReport(item)}>{tr("报告")}</Button>,
              <Button key="review" type="link" onClick={() => startReview(item)}>{tr("处理")}</Button>,
            ]}
          >
            <Space direction="vertical" size={4}>
              <Space wrap>
                <Tag color={String(item.severity).toUpperCase() === "SEVERE" ? "error" : "warning"}>{String(item.severity).toUpperCase() === "SEVERE" ? tr("严重") : tr("警告")}</Tag>
                <Tag>{item.anomalyLabel || "unknown"}</Tag>
                <Tag>{(item.mediaExt || "mp4").toUpperCase()}</Tag>
                <Tag>{tr("考场")} {item.roomId || "-"}</Tag>
                {reviewTag(item.reviewStatus, tr)}
              </Space>
              <Text>{tr("异常时间")}: {formatTs(item.anomalyTsMs || item.anomalyAt, locale)}</Text>
              <Text>{tr("处理人")}: {item.reviewedByName || "-"} | {tr("处理时间")}: {formatTs(item.reviewedAt, locale)}</Text>
              <Text>{tr("处理备注")}: {item.reviewNote || "-"}</Text>
              <Text type="secondary">{tr("证据ID")}: {item.evidenceId}</Text>
            </Space>
          </List.Item>
        )}
      />

      <Modal
        title={tr("处理作弊证据")}
        open={!!reviewing}
        onCancel={() => {
          setReviewing(null);
          form.resetFields();
        }}
        onOk={() => form.submit()}
        confirmLoading={saving}
        okText={tr("保存")}
        cancelText={tr("取消")}
        {...opaqueWhiteModalProps}
      >
        <Form form={form} layout="vertical" onFinish={submitReview}>
          <Form.Item name="reviewStatus" label={tr("处理结果")} rules={[{ required: true, message: tr("请选择处理结果") }]}>
            <Select options={reviewOptions} />
          </Form.Item>
          <Form.Item name="reviewNote" label={tr("处理备注")}>
            <Input.TextArea rows={4} placeholder={tr("输入处理说明")} />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
}

function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 30000);
}
