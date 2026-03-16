import { useEffect, useState } from "react";
import { api } from "../../apiClient";
import { Button, Card, Col, Form, Input, InputNumber, Row, Space, Switch, Typography, message } from "antd";
import useCatalogTranslation from "../../i18n/useCatalogTranslation";

const { Title, Text } = Typography;

const groupConfig = [
  {
    key: "base",
    title: "基础服务配置",
    fields: [
      { key: "serverPort", label: "服务端口", type: "text" },
      { key: "corsOrigins", label: "CORS 来源", type: "text" },
      { key: "faceBase", label: "人脸服务地址", type: "text" },
      { key: "anomalyBase", label: "异常检测地址", type: "text" },
    ],
  },
  {
    key: "mail",
    title: "邮件服务配置",
    fields: [
      { key: "enabled", label: "启用邮件", type: "switch" },
      { key: "host", label: "SMTP 主机", type: "text" },
      { key: "port", label: "SMTP 端口", type: "number" },
      { key: "username", label: "用户名", type: "text" },
      { key: "from", label: "发件人", type: "text" },
    ],
  },
  {
    key: "face",
    title: "人脸识别参数",
    fields: [
      { key: "verifyThreshold", label: "验证阈值", type: "number", step: 0.01 },
      { key: "minDetScore", label: "最小检测分", type: "number", step: 0.01 },
    ],
  },
  {
    key: "anomaly",
    title: "异常检测参数",
    fields: [
      { key: "minDurationMs", label: "最小时长(ms)", type: "number" },
      { key: "maxReconnectCount", label: "最大重连次数", type: "number" },
    ],
  },
  {
    key: "evidence",
    title: "证据视频参数",
    fields: [
      { key: "videoFormat", label: "视频格式", type: "text" },
      { key: "paddingBeforeMs", label: "前置缓冲(ms)", type: "number" },
      { key: "paddingAfterMs", label: "后置缓冲(ms)", type: "number" },
    ],
  },
  {
    key: "security",
    title: "账号安全策略",
    fields: [
      { key: "passwordMinLength", label: "密码最小长度", type: "number" },
      { key: "passwordRequireLetter", label: "要求字母", type: "switch" },
      { key: "passwordRequireNumber", label: "要求数字", type: "switch" },
      { key: "maxLoginAttempts", label: "最大登录失败次数", type: "number" },
      { key: "lockMinutes", label: "锁定时长(分钟)", type: "number" },
    ],
  },
  {
    key: "storage",
    title: "录制与存储治理",
    fields: [
      { key: "evidenceRetentionDays", label: "证据保留天数", type: "number" },
      { key: "recordingRetentionDays", label: "原始切片保留天数", type: "number" },
      { key: "cleanupEnabled", label: "启用自动清理", type: "switch" },
      { key: "cleanupMode", label: "清理策略", type: "text" },
      { key: "warningThresholdGb", label: "预警阈值(GB)", type: "number" },
    ],
  },
];

function renderField(field) {
  if (field.type === "switch") {
    return <Switch />;
  }
  if (field.type === "number") {
    return <InputNumber style={{ width: "100%" }} step={field.step || 1} />;
  }
  return <Input />;
}

export default function AdminSettingsPage() {
  const { tr } = useCatalogTranslation();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [cleanupLoading, setCleanupLoading] = useState(false);
  const [storageMeta, setStorageMeta] = useState(null);
  const [form] = Form.useForm();

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const r = await api.get("/admin/settings");
      const data = r.data || {};
      form.setFieldsValue(data);
      setStorageMeta(data.storage || null);
    } catch (e) {
      message.error(e.message || "加载平台参数失败");
    } finally {
      setLoading(false);
    }
  }

  async function submit(values) {
    setSaving(true);
    try {
      const payload = { ...values };
      delete payload.ok;
      if (payload.storage) {
        delete payload.storage.totalBytes;
        delete payload.storage.totalGb;
        delete payload.storage.warningTriggered;
        delete payload.storage.expiredEvidenceCount;
        delete payload.storage.expiredRecordingCount;
        delete payload.storage.evidenceDir;
      }
      await api.put("/admin/settings", payload);
      message.success("平台参数已保存");
      await load();
    } catch (e) {
      message.error(e.message || "保存平台参数失败");
    } finally {
      setSaving(false);
    }
  }

  async function cleanupStorage() {
    setCleanupLoading(true);
    try {
      const r = await api.post("/admin/settings/storage/cleanup");
      message.success(`清理完成：证据 ${r.data?.deletedEvidence || 0} 条，切片 ${r.data?.deletedSegments || 0} 条`);
      await load();
    } catch (e) {
      message.error(e.message || "执行清理失败");
    } finally {
      setCleanupLoading(false);
    }
  }

  return (
    <Form form={form} layout="vertical" onFinish={submit}>
      <div style={{ display: "grid", gap: 12 }}>
        <Card className="glass-effect" variant={false} style={{ borderRadius: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <div>
              <Title level={4} style={{ margin: 0 }}>{tr("平台参数配置")}</Title>
              <Text type="secondary">{tr("支持平台参数持久化、安全策略调整和存储治理。")}</Text>
            </div>
            <Space>
              <Button onClick={load} loading={loading}>{tr("刷新")}</Button>
              <Button type="primary" htmlType="submit" loading={saving}>{tr("保存配置")}</Button>
            </Space>
          </div>
        </Card>

        <Row gutter={[12, 12]}>
          {groupConfig.map((group) => (
            <Col xs={24} xl={12} key={group.key}>
              <Card className="glass-effect" variant={false} style={{ borderRadius: 12, height: "100%" }}>
                <Title level={5} style={{ marginTop: 0 }}>{tr(group.title)}</Title>
                {group.fields.map((field) => (
                  <Form.Item
                    key={`${group.key}.${field.key}`}
                    name={[group.key, field.key]}
                    label={tr(field.label)}
                    valuePropName={field.type === "switch" ? "checked" : "value"}
                  >
                    {renderField(field)}
                  </Form.Item>
                ))}
                {group.key === "storage" && (
                  <div style={{ marginTop: 8 }}>
                    <Text style={{ display: "block" }}>{tr("存储目录")}：{storageMeta?.evidenceDir || "-"}</Text>
                    <Text style={{ display: "block" }}>{tr("当前占用")}：{storageMeta?.totalGb || 0} GB</Text>
                    <Text style={{ display: "block" }}>{tr("预警状态")}：{storageMeta?.warningTriggered ? tr("已触发") : tr("正常")}</Text>
                    <Text style={{ display: "block" }}>{tr("待清理证据")}：{storageMeta?.expiredEvidenceCount || 0} {tr("条")}</Text>
                    <Text style={{ display: "block", marginBottom: 12 }}>{tr("待清理切片")}：{storageMeta?.expiredRecordingCount || 0} {tr("条")}</Text>
                    <Button onClick={cleanupStorage} loading={cleanupLoading}>{tr("立即清理过期存储")}</Button>
                  </div>
                )}
              </Card>
            </Col>
          ))}
        </Row>
      </div>
    </Form>
  );
}
