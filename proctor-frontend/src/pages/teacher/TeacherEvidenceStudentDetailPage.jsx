// TeacherEvidenceStudentDetailPage 展示某位学生的异常证据详情，支持查看时间点、媒体和审核状态。
import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { api } from "../../apiClient";
import { Button, Card, Empty, Form, Input, List, Modal, Select, Space, Tag, Typography, message } from "antd";
import { opaqueWhiteModalProps } from "../school/modalStyles";
import useCatalogTranslation from "../../i18n/useCatalogTranslation";

const { Title, Text } = Typography;

// 负责把输入数据整理成当前页面更容易消费的格式。
// 跟读这个函数时，建议同时留意它依赖了哪些 state/ref，以及执行后会触发哪些界面刷新。
function formatTs(ts, locale) {
  if (ts === null || ts === undefined || ts === "") return "-";
  const d = new Date(Number(ts) || ts);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString(locale, { hour12: false });
}

// 负责把页面中的一段独立交互逻辑拆出来，避免主组件渲染区混入过多细节。
// 跟读这个函数时，建议同时留意它依赖了哪些 state/ref，以及执行后会触发哪些界面刷新。
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

export default function TeacherEvidenceStudentDetailPage() {
  const { tr, locale } = useCatalogTranslation();
  const { examRoomId, studentId } = useParams();
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

  // 这个 effect 负责在依赖变化时同步加载数据或建立/释放副作用。
  // 阅读时可以重点看依赖数组、内部异步流程以及 return 清理逻辑三部分。
  useEffect(() => {
    load();
  }, [examRoomId]);

  // 负责读取当前页面所需的数据，并把结果同步到 state 中。
  // 跟读这个函数时，建议同时留意它依赖了哪些 state/ref，以及执行后会触发哪些界面刷新。
  async function load() {
    try {
      const r = await api.get(`/evidence/rooms/${examRoomId}`);
      setItems(r.data?.items || []);
      setMsg("");
    } catch (e) {
      setMsg(e.message || tr("加载证据详情失败"));
    }
  }

  const list = useMemo(
    () => (items || []).filter((it) => Number(it.studentId) === Number(studentId)).sort((a, b) => Number(b.anomalyTsMs || 0) - Number(a.anomalyTsMs || 0)),
    [items, studentId],
  );

  // 负责把某个对象加载到当前页面上下文中，并更新相关显示状态。
  // 跟读这个函数时，建议同时留意它依赖了哪些 state/ref，以及执行后会触发哪些界面刷新。
  async function openEvidence(item, mode = "preview") {
    const res = await api.get(`/evidence/${item.evidenceId}/media`, {
      responseType: "blob",
      params: { disposition: mode === "download" ? "attachment" : "inline" },
    });
    downloadBlob(res.data, `${item.evidenceId}.${item.mediaExt || "mp4"}`, mode === "download");
  }

  // 负责把页面中的一段独立交互逻辑拆出来，避免主组件渲染区混入过多细节。
  // 跟读这个函数时，建议同时留意它依赖了哪些 state/ref，以及执行后会触发哪些界面刷新。
  async function exportReport(item) {
    try {
      const res = await api.get(`/evidence/${item.evidenceId}/report`, { responseType: "blob" });
      downloadBlob(res.data, `evidence-report-${item.evidenceId}.txt`, true);
    } catch (e) {
      message.error(e.message || tr("导出处理报告失败"));
    }
  }

  // 负责把页面中的一段独立交互逻辑拆出来，避免主组件渲染区混入过多细节。
  // 跟读这个函数时，建议同时留意它依赖了哪些 state/ref，以及执行后会触发哪些界面刷新。
  async function exportList() {
    try {
      const res = await api.post("/evidence/export-list", { evidenceIds: list.map((item) => item.evidenceId) }, { responseType: "blob" });
      downloadBlob(res.data, `teacher-evidence-list-${examRoomId}-${studentId}.csv`, true);
    } catch (e) {
      message.error(e.message || tr("导出证据列表失败"));
    }
  }

  // 负责把页面中的一段独立交互逻辑拆出来，避免主组件渲染区混入过多细节。
  // 跟读这个函数时，建议同时留意它依赖了哪些 state/ref，以及执行后会触发哪些界面刷新。
  async function exportZip() {
    try {
      const res = await api.post("/evidence/export-zip", { evidenceIds: list.map((item) => item.evidenceId) }, { responseType: "blob" });
      downloadBlob(res.data, `teacher-evidences-${examRoomId}-${studentId}.zip`, true);
    } catch (e) {
      message.error(e.message || tr("批量下载证据失败"));
    }
  }

  // 负责驱动一段带外部依赖的流程，例如权限申请、实时通信或轮询检查。
  // 跟读这个函数时，建议同时留意它依赖了哪些 state/ref，以及执行后会触发哪些界面刷新。
  function startReview(item) {
    setReviewing(item);
    form.setFieldsValue({
      reviewStatus: item.reviewStatus || "PENDING",
      reviewNote: item.reviewNote || "",
    });
  }

  // 负责处理当前页面的提交型交互，并在成功后刷新界面状态。
  // 跟读这个函数时，建议同时留意它依赖了哪些 state/ref，以及执行后会触发哪些界面刷新。
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
    <Card className="glass-effect" variant="borderless" style={{ borderRadius: 16 }}>
      <Space direction="vertical" size={8} style={{ width: "100%" }}>
        <Button onClick={() => navigate(-1)} style={{ width: "fit-content" }}>{tr("← 返回学生列表")}</Button>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div>
            <Title level={5} style={{ margin: 0 }}>
              {tr(`${location.state?.studentName || `学生#${studentId}`} 的作弊详情（考试：${location.state?.examName || "-"})`)}
            </Title>
            {!!msg && <Text type="danger">{msg}</Text>}
          </div>
          <Space wrap>
            <Button onClick={exportList} disabled={!list.length}>{tr("导出证据列表")}</Button>
            <Button type="primary" onClick={exportZip} disabled={!list.length}>{tr("批量下载证据")}</Button>
          </Space>
        </div>
      </Space>

      <List
        style={{ marginTop: 12 }}
        locale={{ emptyText: <Empty description={tr("该学生暂无作弊证据")} /> }}
        dataSource={list}
        renderItem={(item) => (
          <List.Item
            style={{ paddingLeft: "10px" }}
            actions={[
              <Button key="preview" onClick={() => openEvidence(item, "preview")}>{tr("预览")}</Button>,
              <Button key="download" onClick={() => openEvidence(item, "download")}>{tr("下载")}</Button>,
              <Button key="report" onClick={() => exportReport(item)}>{tr("报告")}</Button>,
              <Button key="review" type="link" onClick={() => startReview(item)}>{tr("处理")}</Button>,
            ]}
          >
            <Space direction="vertical" size={2}>
              <Space wrap>
                <Tag color={String(item.severity).toUpperCase() === "SEVERE" ? "error" : "warning"}>{String(item.severity).toUpperCase() === "SEVERE" ? tr("严重") : tr("警告")}</Tag>
                <Tag>{item.anomalyLabel || "unknown"}</Tag>
                <Tag>{(item.mediaExt || "mp4").toUpperCase()}</Tag>
                {reviewTag(item.reviewStatus, tr)}
              </Space>
              <Text>{tr("作弊时间")}: {formatTs(item.anomalyTsMs || item.anomalyAt, locale)}</Text>
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

// 负责把页面中的一段独立交互逻辑拆出来，避免主组件渲染区混入过多细节。
// 跟读这个函数时，建议同时留意它依赖了哪些 state/ref，以及执行后会触发哪些界面刷新。
function downloadBlob(blob, fileName, download) {
  const url = URL.createObjectURL(blob);
  if (download) {
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    a.click();
  } else {
    window.open(url, "_blank", "noopener,noreferrer");
  }
  window.setTimeout(() => URL.revokeObjectURL(url), 30000);
}
