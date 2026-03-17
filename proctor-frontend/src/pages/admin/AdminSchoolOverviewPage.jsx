// AdminSchoolOverviewPage 汇总学校、考试和用户等平台级统计信息。
import { useEffect, useMemo, useState } from "react";
import { api } from "../../apiClient";
import { Card, Col, List, Row, Statistic, Table, Tag, Typography, message } from "antd";
import useCatalogTranslation from "../../i18n/useCatalogTranslation";

const { Title, Text } = Typography;

export default function AdminSchoolOverviewPage() {
  const { tr } = useCatalogTranslation();
  const [schools, setSchools] = useState([]);
  const [loading, setLoading] = useState(false);

  // 这个 effect 负责在依赖变化时同步加载数据或建立/释放副作用。
  // 阅读时可以重点看依赖数组、内部异步流程以及 return 清理逻辑三部分。
  useEffect(() => {
    load();
  }, []);

  // 负责读取当前页面所需的数据，并把结果同步到 state 中。
  // 跟读这个函数时，建议同时留意它依赖了哪些 state/ref，以及执行后会触发哪些界面刷新。
  async function load() {
    setLoading(true);
    try {
      const r = await api.get("/admin/schools");
      setSchools(r.data || []);
    } catch (e) {
      message.error(e.message || "加载学校总览失败");
    } finally {
      setLoading(false);
    }
  }

  const stats = useMemo(() => {
    const list = schools || [];
    return {
      schoolCount: list.length,
      activeSchoolCount: list.filter((item) => Number(item.adminEnabled) === 1).length,
      teacherCount: list.reduce((sum, item) => sum + Number(item.teacherCount || 0), 0),
      studentCount: list.reduce((sum, item) => sum + Number(item.studentCount || 0), 0),
      examCount: list.reduce((sum, item) => sum + Number(item.examCount || 0), 0),
      evidenceCount: list.reduce((sum, item) => sum + Number(item.evidenceCount || 0), 0),
    };
  }, [schools]);

  const riskRanking = useMemo(
    () => [...(schools || [])]
      .map((item) => ({
        ...item,
        riskScore: Number(item.studentCount || 0) > 0 ? ((Number(item.evidenceCount || 0) / Number(item.studentCount || 1)) * 100).toFixed(2) : "0.00",
      }))
      .sort((a, b) => Number(b.evidenceCount || 0) - Number(a.evidenceCount || 0))
      .slice(0, 5),
    [schools],
  );

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <Card className="glass-effect" variant={false} style={{ borderRadius: 12 }}>
        <div style={{ marginBottom: 20 }}>
          <Title level={4} style={{ margin: 0 }}>{tr("全平台学校总览")}</Title>
          <Text type="secondary">{tr("按学校汇总平台账号、考试与证据规模")}</Text>
        </div>
        <Row gutter={[12, 12]}>
          <Col xs={24} sm={12} xl={4}><Card><Statistic title={tr("学校总数")} value={stats.schoolCount} /></Card></Col>
          <Col xs={24} sm={12} xl={4}><Card><Statistic title={tr("启用学校")} value={stats.activeSchoolCount} /></Card></Col>
          <Col xs={24} sm={12} xl={4}><Card><Statistic title={tr("老师总数")} value={stats.teacherCount} /></Card></Col>
          <Col xs={24} sm={12} xl={4}><Card><Statistic title={tr("学生总数")} value={stats.studentCount} /></Card></Col>
          <Col xs={24} sm={12} xl={4}><Card><Statistic title={tr("考试总数")} value={stats.examCount} /></Card></Col>
          <Col xs={24} sm={12} xl={4}><Card><Statistic title={tr("证据总数")} value={stats.evidenceCount} /></Card></Col>
        </Row>
      </Card>

      <Card className="glass-effect" variant={false} style={{ borderRadius: 12 }}>
        <Table
          rowKey="id"
          loading={loading}
          dataSource={schools}
          pagination={{ pageSize: 10 }}
          scroll={{ x: 1200 }}
          columns={[
            { title: tr("学校名称"), dataIndex: "name", width: 180 },
            { title: tr("管理员"), dataIndex: "adminName", width: 140, render: (text) => text || "-" },
            {
              title: tr("状态"),
              dataIndex: "adminEnabled",
              width: 100,
              render: (value) => <Tag color={Number(value) === 1 ? "success" : "default"}>{Number(value) === 1 ? tr("启用中") : tr("已停用")}</Tag>,
            },
            { title: tr("学院数"), dataIndex: "departmentCount", width: 100 },
            { title: tr("专业数"), dataIndex: "majorCount", width: 100 },
            { title: tr("老师数"), dataIndex: "teacherCount", width: 100 },
            { title: tr("学生数"), dataIndex: "studentCount", width: 100 },
            { title: tr("考试数"), dataIndex: "examCount", width: 100 },
            { title: tr("进行中考试"), dataIndex: "runningExamCount", width: 120 },
            { title: tr("证据数"), dataIndex: "evidenceCount", width: 100 },
          ]}
        />
      </Card>

      <Card className="glass-effect" variant={false} style={{ borderRadius: 12 }}>
        <Title level={5} style={{ marginTop: 0 }}>{tr("平台维度风险排行")}</Title>
        <Text type="secondary">{tr("按证据数量和学生占比计算的平台重点关注学校。")}</Text>
        <List
          style={{ marginTop: 12 }}
          dataSource={riskRanking}
          renderItem={(item, index) => (
            <List.Item>
              <div style={{ width: "100%", display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <Text strong>{index + 1}. {item.name}</Text>
                <Text>{tr("证据")} {item.evidenceCount || 0} {tr("条")} | {tr("风险占比")} {item.riskScore}%</Text>
              </div>
            </List.Item>
          )}
        />
      </Card>
    </div>
  );
}
