import { useEffect, useMemo, useState } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import { api } from "../../apiClient";
import { Button, Card, Empty, Input, List, Space, Tag, Typography } from "antd";
import { SearchOutlined } from "@ant-design/icons";
import useCatalogTranslation from "../../i18n/useCatalogTranslation";

const { Title, Text } = Typography;

function formatTs(value, locale) {
  const date = new Date(Number(value) || value || Date.now());
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString(locale, { hour12: false });
}

export default function SchoolEvidenceExamsPage() {
  const { school } = useOutletContext();
  const { tr, locale, language } = useCatalogTranslation();
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [keyword, setKeyword] = useState("");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    if (!school?.id) return;
    api.get(`/evidence/school/${school.id}`)
      .then((r) => setItems(r.data?.items || []))
      .catch((e) => setMsg(e.message || tr("加载本校证据失败")));
  }, [school?.id, tr]);

  const exams = useMemo(() => {
    const grouped = new Map();
    (items || []).forEach((item) => {
      const examId = String(item.examId || "0");
      const prev = grouped.get(examId) || {
        examId,
        examName: item.examName || `考试#${examId}`,
        latestTs: 0,
        evidenceCount: 0,
        rooms: new Set(),
        students: new Set(),
      };
      prev.evidenceCount += 1;
      prev.latestTs = Math.max(prev.latestTs, Number(item.anomalyTsMs || 0));
      if (item.roomId) prev.rooms.add(String(item.roomId));
      if (item.studentId) prev.students.add(String(item.studentId));
      grouped.set(examId, prev);
    });
    return Array.from(grouped.values())
      .filter((item) => !keyword.trim() || item.examName.toLowerCase().includes(keyword.trim().toLowerCase()))
      .sort((a, b) => b.latestTs - a.latestTs);
  }, [items, keyword]);
  const joiner = language === "zh-CN" ? "、" : ", ";

  return (
    <Card className="glass-effect" variant="borderless" style={{ borderRadius: 16, height: "100%", overflowY: "auto" }}>
      <Space direction="vertical" size={12} style={{ width: "100%" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div>
            <Title level={4} style={{ margin: 0 }}>{tr("本校证据查看")}</Title>
            <Text type="secondary">{tr("按考试聚合查看本校全部作弊证据")}</Text>
          </div>
          <Input
            allowClear
            prefix={<SearchOutlined />}
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder={tr("输入考试名称查询")}
            style={{ width: 280 }}
          />
        </div>
        {!!msg && <Text type="danger">{msg}</Text>}
      </Space>

      <List
        style={{ marginTop: 16 }}
        locale={{ emptyText: <Empty description={tr("暂无本校证据记录")} /> }}
        dataSource={exams}
        renderItem={(exam) => (
          <List.Item
            style={{ paddingLeft: "10px" }}
            actions={[
              <Button
                key="view"
                type="primary"
                onClick={() => navigate(`/school/evidence/exams/${exam.examId}/students`, { state: { examName: exam.examName } })}
              >
                {tr("查看证据")}
              </Button>,
            ]}
          >
            <List.Item.Meta
              title={(
                <Space wrap>
                  <span>{exam.examName}</span>
                  <Tag color="processing">{tr("证据")} {exam.evidenceCount} {tr("条")}</Tag>
                  <Tag>{tr("学生")} {exam.students.size} {tr("人")}</Tag>
                  <Tag>{tr("考场数")} {exam.rooms.size}</Tag>
                </Space>
              )}
              description={(
                <Space direction="vertical" size={2}>
                  <Text>{tr("最近异常时间")}: {formatTs(exam.latestTs, locale)}</Text>
                  <Text>{tr("涉及考场")}: {Array.from(exam.rooms).join(joiner) || "-"}</Text>
                </Space>
              )}
            />
          </List.Item>
        )}
      />
    </Card>
  );
}
