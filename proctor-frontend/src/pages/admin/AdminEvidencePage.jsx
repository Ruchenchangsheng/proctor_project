import { useEffect, useMemo, useState } from "react";
import { api } from "../../apiClient";
import { Button, Card, Input, Select, Space, Table, Tag, Typography, message } from "antd";
import { ReloadOutlined, SearchOutlined } from "@ant-design/icons";
import i18n from "../../i18n/i18n";
import { toIntlLocale } from "../../i18n/catalog";
import useCatalogTranslation from "../../i18n/useCatalogTranslation";

const { Title, Text } = Typography;

function formatTs(value) {
  const date = new Date(Number(value) || value || Date.now());
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString(toIntlLocale(i18n.language), { hour12: false });
}

export default function AdminEvidencePage() {
  const { tr } = useCatalogTranslation();
  const [schools, setSchools] = useState([]);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({ schoolId: undefined, severity: undefined, keyword: "" });
  const [keywordInput, setKeywordInput] = useState("");
  const [selectedRowKeys, setSelectedRowKeys] = useState([]);

  useEffect(() => {
    initialize();
  }, []);

  async function initialize() {
    setLoading(true);
    try {
      const [schoolResp, evidenceResp] = await Promise.all([
        api.get("/admin/schools"),
        api.get("/evidence/all"),
      ]);
      setSchools(schoolResp.data || []);
      setItems(evidenceResp.data?.items || []);
    } catch (e) {
      message.error(e.message || "加载证据中心失败");
    } finally {
      setLoading(false);
    }
  }

  const schoolMap = useMemo(() => {
    const map = new Map();
    (schools || []).forEach((item) => map.set(Number(item.id), item.name));
    return map;
  }, [schools]);

  const filtered = useMemo(() => {
    const keyword = filters.keyword.trim().toLowerCase();
    return (items || [])
      .filter((item) => !filters.schoolId || Number(item.schoolId) === Number(filters.schoolId))
      .filter((item) => !filters.severity || String(item.severity).toUpperCase() === String(filters.severity).toUpperCase())
      .filter((item) => {
        if (!keyword) return true;
        const haystack = [
          item.evidenceId,
          item.examName,
          item.studentName,
          item.anomalyLabel,
        ].join(" ").toLowerCase();
        return haystack.includes(keyword);
      })
      .sort((a, b) => Number(b.anomalyTsMs || 0) - Number(a.anomalyTsMs || 0));
  }, [items, filters]);

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

  async function exportSelected(type) {
    if (!selectedRowKeys.length) {
      message.warning("请先勾选证据");
      return;
    }
    try {
      const res = await api.post(type === "zip" ? "/evidence/export-zip" : "/evidence/export-list", { evidenceIds: selectedRowKeys }, { responseType: "blob" });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = type === "zip" ? "admin-evidences.zip" : "admin-evidence-list.csv";
      a.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 30000);
    } catch (e) {
      message.error(e.message || "导出证据失败");
    }
  }

  return (
    <Card className="glass-effect" variant={false} style={{ borderRadius: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
        <div>
          <Title level={4} style={{ margin: 0 }}>{tr("全平台作弊证据中心")}</Title>
          <Text type="secondary">{tr("平台级统一检索、预览与下载作弊证据")}</Text>
        </div>
        <Space wrap>
          <Button onClick={() => exportSelected("list")} disabled={!selectedRowKeys.length}>{tr("导出证据列表")}</Button>
          <Button type="primary" onClick={() => exportSelected("zip")} disabled={!selectedRowKeys.length}>{tr("批量下载证据")}</Button>
          <Select
            allowClear
            value={filters.schoolId}
            placeholder={tr("学校")}
            style={{ width: 180 }}
            options={(schools || []).map((item) => ({ value: item.id, label: item.name }))}
            onChange={(value) => setFilters((prev) => ({ ...prev, schoolId: value }))}
          />
          <Select
            allowClear
            value={filters.severity}
            placeholder={tr("严重级别")}
            style={{ width: 140 }}
            options={[
              { value: "WARNING", label: tr("警告") },
              { value: "SEVERE", label: tr("严重") },
            ]}
            onChange={(value) => setFilters((prev) => ({ ...prev, severity: value }))}
          />
          <Input
            allowClear
            prefix={<SearchOutlined />}
            value={keywordInput}
            placeholder={tr("输入考试/学生/异常/证据ID")}
            style={{ width: 280 }}
            onChange={(e) => setKeywordInput(e.target.value)}
            onPressEnter={() => setFilters((prev) => ({ ...prev, keyword: keywordInput }))}
          />
          <Button icon={<SearchOutlined />} onClick={() => setFilters((prev) => ({ ...prev, keyword: keywordInput }))}>{tr("查询")}</Button>
          <Button
            icon={<ReloadOutlined />}
            onClick={() => {
              setKeywordInput("");
              setFilters({ schoolId: undefined, severity: undefined, keyword: "" });
            }}
          >
            {tr("重置")}
          </Button>
        </Space>
      </div>

      <Table
        rowKey="evidenceId"
        loading={loading}
        dataSource={filtered}
        rowSelection={{
          selectedRowKeys,
          onChange: setSelectedRowKeys,
        }}
        pagination={{ pageSize: 10 }}
        scroll={{ x: 1450 }}
        columns={[
          { title: tr("学校"), key: "schoolName", width: 160, render: (_, row) => schoolMap.get(Number(row.schoolId)) || `学校#${row.schoolId}` },
          { title: tr("考试"), dataIndex: "examName", width: 180, ellipsis: true, render: (text) => text || "-" },
          { title: tr("学生"), dataIndex: "studentName", width: 120, render: (text) => text || "-" },
          { title: tr("考场"), dataIndex: "roomId", width: 90, render: (text) => text || "-" },
          {
            title: tr("严重级别"),
            dataIndex: "severity",
            width: 110,
            render: (value) => <Tag color={String(value).toUpperCase() === "SEVERE" ? "error" : "warning"}>{String(value).toUpperCase() === "SEVERE" ? tr("严重") : tr("警告")}</Tag>,
          },
          { title: tr("异常类型"), dataIndex: "anomalyLabel", width: 160, render: (text) => text || "-" },
          {
            title: tr("处理状态"),
            dataIndex: "reviewStatus",
            width: 120,
            render: (value) => (
              <Tag color={value === "CONFIRMED_CHEATING" ? "error" : value === "FALSE_POSITIVE" ? "default" : value === "REVIEWED" ? "processing" : "warning"}>
                {value === "CONFIRMED_CHEATING" ? tr("确认作弊") : value === "FALSE_POSITIVE" ? tr("误报") : value === "REVIEWED" ? tr("已核查") : tr("待处理")}
              </Tag>
            ),
          },
          { title: tr("异常时间"), key: "anomalyTsMs", width: 180, render: (_, row) => formatTs(row.anomalyTsMs || row.anomalyAt) },
          { title: tr("格式"), dataIndex: "mediaExt", width: 90, render: (text) => (text || "mp4").toUpperCase() },
          { title: tr("证据ID"), dataIndex: "evidenceId", width: 260, ellipsis: true },
          {
            title: tr("操作"),
            key: "action",
            width: 140,
            render: (_, record) => (
              <Space size={4}>
                <Button type="link" onClick={() => openEvidence(record, "preview")}>{tr("预览")}</Button>
                <Button type="link" onClick={() => openEvidence(record, "download")}>{tr("下载")}</Button>
              </Space>
            ),
          },
        ]}
      />
    </Card>
  );
}
