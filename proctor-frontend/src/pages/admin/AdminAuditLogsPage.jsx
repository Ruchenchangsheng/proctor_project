import { useEffect, useState } from "react";
import { api } from "../../apiClient";
import { Card, Table, Tag, Typography, message } from "antd";
import useCatalogTranslation from "../../i18n/useCatalogTranslation";

const { Title, Text } = Typography;

const typeColorMap = {
  SETTINGS_UPDATE: "blue",
  TEMPLATE_UPDATE: "gold",
  EVIDENCE_PREVIEW: "red",
  EVIDENCE_EXPORT: "volcano",
  EXAM_CREATE: "green",
  EXAM_UPDATE: "processing",
  ACCOUNT_RESET: "purple",
  ACCOUNT_TOGGLE: "cyan",
};

const typeLabelMap = {
  SETTINGS_UPDATE: "平台参数更新",
  TEMPLATE_UPDATE: "通知模板更新",
  EVIDENCE_PREVIEW: "证据预览",
  EVIDENCE_EXPORT: "证据导出",
  EXAM_CREATE: "创建考试",
  EXAM_UPDATE: "修改考试",
};

export default function AdminAuditLogsPage() {
  const { tr } = useCatalogTranslation();
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const r = await api.get("/admin/recent-activities");
      setList(r.data || []);
    } catch (e) {
      message.error(e.message || "加载审计日志失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="glass-effect" variant={false} style={{ borderRadius: 12 }}>
      <div style={{ marginBottom: 20 }}>
        <Title level={4} style={{ margin: 0 }}>{tr("审计日志 / 操作日志")}</Title>
        <Text type="secondary">{tr("展示冻结账号、重置密码、修改考试、查看/导出证据、存储清理等已落库审计事件。")}</Text>
      </div>
      <Table
        rowKey={(record, index) => `${record.type}-${record.time}-${index}`}
        loading={loading}
        dataSource={list}
        pagination={{ pageSize: 12 }}
        columns={[
          { title: tr("时间"), dataIndex: "time", width: 180, render: (text) => text || "-" },
          { title: tr("类型"), dataIndex: "type", width: 160, render: (value) => <Tag color={typeColorMap[value] || "default"}>{tr(typeLabelMap[value] || value || "-")}</Tag> },
          { title: tr("标题"), dataIndex: "title", width: 280, render: (text) => tr(text || "-") },
          { title: tr("详情"), dataIndex: "detail", render: (text) => tr(text || "-") },
        ]}
      />
    </Card>
  );
}
