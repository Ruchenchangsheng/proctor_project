import { useEffect, useState } from "react";
import { api } from "../../apiClient";
import { Button, Card, Col, Input, Row, Space, Switch, Typography, message } from "antd";
import useCatalogTranslation from "../../i18n/useCatalogTranslation";

const { TextArea } = Input;
const { Paragraph, Text, Title } = Typography;

const previewVars = {
  name: "张三",
  email: "zhangsan@example.edu.cn",
  password: "Ab3_9k88",
  content: "考试安排已更新，请及时登录平台查看。",
};

function renderPreview(template) {
  let result = template || "";
  Object.entries(previewVars).forEach(([key, value]) => {
    result = result.replaceAll(`\${${key}}`, value);
  });
  return result;
}

export default function AdminNotificationsPage() {
  const { tr } = useCatalogTranslation();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [savingCode, setSavingCode] = useState("");

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const r = await api.get("/admin/notification-templates");
      setItems(r.data?.items || []);
    } catch (e) {
      message.error(e.message || "加载通知模板失败");
    } finally {
      setLoading(false);
    }
  }

  function updateLocal(templateCode, patch) {
    setItems((prev) => prev.map((item) => (
      item.templateCode === templateCode ? { ...item, ...patch } : item
    )));
  }

  async function save(item) {
    setSavingCode(item.templateCode);
    try {
      await api.put(`/admin/notification-templates/${item.templateCode}`, {
        channel: item.channel,
        subject: item.subject,
        content: item.content,
        enabled: Number(item.enabled) === 1 || item.enabled === true,
      });
      message.success(`模板 ${item.templateCode} 已保存`);
      await load();
    } catch (e) {
      message.error(e.message || "保存模板失败");
    } finally {
      setSavingCode("");
    }
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <Card className="glass-effect" variant={false} style={{ borderRadius: 12 }}>
        <Title level={4} style={{ margin: 0 }}>{tr("公告通知 / 邮件模板")}</Title>
        <Text type="secondary">{tr("模板已持久化到数据库，修改后可直接用于账号开通、密码重置与系统通知。")}</Text>
      </Card>

      <Row gutter={[12, 12]}>
        {(items || []).map((item) => (
          <Col xs={24} xl={12} key={item.templateCode}>
            <Card className="glass-effect" variant={false} style={{ borderRadius: 12, height: "100%" }} loading={loading}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 12 }}>
                <div>
                  <Title level={5} style={{ margin: 0 }}>{item.templateCode}</Title>
                  <Text type="secondary">{tr("通道")}：{item.channel || "-"}</Text>
                </div>
                <Space>
                  <Text>{tr("启用")}</Text>
                  <Switch
                    checked={Number(item.enabled) === 1 || item.enabled === true}
                    onChange={(checked) => updateLocal(item.templateCode, { enabled: checked ? 1 : 0 })}
                  />
                </Space>
              </div>

              <Paragraph>{tr("主题")}</Paragraph>
              <Input
                value={item.subject}
                onChange={(e) => updateLocal(item.templateCode, { subject: e.target.value })}
                style={{ marginBottom: 12 }}
              />

              <Paragraph>{tr("模板内容")}</Paragraph>
              <TextArea
                rows={8}
                value={item.content}
                onChange={(e) => updateLocal(item.templateCode, { content: e.target.value })}
              />

              <Paragraph style={{ marginTop: 16, marginBottom: 8 }}>{tr("示例预览")}</Paragraph>
              <Card size="small" style={{ background: "rgba(255,255,255,0.72)" }}>
                <Paragraph style={{ whiteSpace: "pre-wrap", marginBottom: 0 }}>{renderPreview(item.content)}</Paragraph>
              </Card>

              <Button type="primary" style={{ marginTop: 16 }} loading={savingCode === item.templateCode} onClick={() => save(item)}>
                {tr("保存模板")}
              </Button>
            </Card>
          </Col>
        ))}
      </Row>
    </div>
  );
}
