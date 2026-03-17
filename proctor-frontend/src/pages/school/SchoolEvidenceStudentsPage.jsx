// SchoolEvidenceStudentsPage 展示某场考试下产生异常证据的学生列表。
import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useOutletContext, useParams } from "react-router-dom";
import { api } from "../../apiClient";
import { Button, Card, Empty, Input, List, Space, Tag, Typography } from "antd";
import { SearchOutlined } from "@ant-design/icons";
import useCatalogTranslation from "../../i18n/useCatalogTranslation";

const { Title, Text } = Typography;

// 负责把输入数据整理成当前页面更容易消费的格式。
// 跟读这个函数时，建议同时留意它依赖了哪些 state/ref，以及执行后会触发哪些界面刷新。
function formatTs(value, locale) {
  const date = new Date(Number(value) || value || Date.now());
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString(locale, { hour12: false });
}

export default function SchoolEvidenceStudentsPage() {
  const { school } = useOutletContext();
  const { tr, locale, language } = useCatalogTranslation();
  const { examId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [keyword, setKeyword] = useState("");
  const [msg, setMsg] = useState("");

  // 这个 effect 负责在依赖变化时同步加载数据或建立/释放副作用。
  // 阅读时可以重点看依赖数组、内部异步流程以及 return 清理逻辑三部分。
  useEffect(() => {
    if (!school?.id) return;
    api.get(`/evidence/school/${school.id}`)
      .then((r) => setItems(r.data?.items || []))
      .catch((e) => setMsg(e.message || tr("加载本校证据失败")));
  }, [school?.id, tr]);

  const students = useMemo(() => {
    const grouped = new Map();
    (items || [])
      .filter((item) => Number(item.examId) === Number(examId))
      .forEach((item) => {
        const studentKey = String(item.studentId || "0");
        const prev = grouped.get(studentKey) || {
          studentId: item.studentId,
          studentName: item.studentName || `学生#${studentKey}`,
          evidenceCount: 0,
          latestTs: 0,
          labels: new Set(),
          rooms: new Set(),
        };
        prev.evidenceCount += 1;
        prev.latestTs = Math.max(prev.latestTs, Number(item.anomalyTsMs || 0));
        if (item.anomalyLabel) prev.labels.add(String(item.anomalyLabel));
        if (item.roomId) prev.rooms.add(String(item.roomId));
        grouped.set(studentKey, prev);
      });
    return Array.from(grouped.values())
      .filter((row) => !keyword.trim() || row.studentName.toLowerCase().includes(keyword.trim().toLowerCase()))
      .sort((a, b) => b.latestTs - a.latestTs);
  }, [items, examId, keyword]);
  const joiner = language === "zh-CN" ? "、" : ", ";

  return (
    <Card className="glass-effect" variant="borderless" style={{ borderRadius: 16 }}>
      <Space direction="vertical" size={12} style={{ width: "100%" }}>
        <Button onClick={() => navigate(-1)} style={{ width: "fit-content" }}>{tr("← 返回考试列表")}</Button>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div>
            <Title level={4} style={{ margin: 0 }}>{tr("考试")}: {location.state?.examName || tr(`考试#${examId}`)}</Title>
            <Text type="secondary">{tr("按学生查看本场考试的作弊证据")}</Text>
          </div>
          <Input
            allowClear
            prefix={<SearchOutlined />}
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder={tr("输入学生姓名查询")}
            style={{ width: 260 }}
          />
        </div>
        {!!msg && <Text type="danger">{msg}</Text>}
      </Space>

      <List
        style={{ marginTop: 16 }}
        locale={{ emptyText: <Empty description={tr("本场考试暂无证据")} /> }}
        dataSource={students}
        renderItem={(row) => (
          <List.Item
            actions={[
              <Button
                key="detail"
                type="link"
                onClick={() => navigate(`/school/evidence/exams/${examId}/students/${row.studentId}`, {
                  state: {
                    examName: location.state?.examName,
                    studentName: row.studentName,
                  },
                })}
              >
                {tr("查看详情")}
              </Button>,
            ]}
          >
            <List.Item.Meta
              title={(
                <Space wrap>
                  <span>{row.studentName}</span>
                  <Tag color="warning">{tr("证据")} {row.evidenceCount} {tr("条")}</Tag>
                </Space>
              )}
              description={(
                <Space direction="vertical" size={2}>
                  <Text>{tr("最近异常时间")}: {formatTs(row.latestTs, locale)}</Text>
                  <Text>{tr("涉及考场")}: {Array.from(row.rooms).join(joiner) || "-"}</Text>
                  <Text>{tr("异常类型")}: {Array.from(row.labels).join(joiner) || "-"}</Text>
                </Space>
              )}
            />
          </List.Item>
        )}
      />
    </Card>
  );
}
