// AdminExamsPage 展示平台范围内的考试统计与列表，便于管理员做全局巡检。
import { useEffect, useMemo, useState } from "react";
import { api } from "../../apiClient";
import { Button, Card, Input, Modal, Select, Space, Statistic, Table, Tag, Typography, message } from "antd";
import { ReloadOutlined, SearchOutlined } from "@ant-design/icons";
import { opaqueWhiteModalProps } from "../school/modalStyles";
import useCatalogTranslation from "../../i18n/useCatalogTranslation";

const { Title, Text } = Typography;

const statusLabelMap = {
  NOT_STARTED: "未开始",
  RUNNING: "进行中",
  FINISHED: "已结束",
};

const statusColorMap = {
  NOT_STARTED: "blue",
  RUNNING: "green",
  FINISHED: "default",
};

export default function AdminExamsPage() {
  const { tr } = useCatalogTranslation();
  const [schools, setSchools] = useState([]);
  const [filters, setFilters] = useState({ schoolId: undefined, status: undefined, keyword: "" });
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [rooms, setRooms] = useState([]);
  const [selectedExam, setSelectedExam] = useState(null);
  const [evidenceItems, setEvidenceItems] = useState([]);

  // 这个 effect 负责在依赖变化时同步加载数据或建立/释放副作用。
  // 阅读时可以重点看依赖数组、内部异步流程以及 return 清理逻辑三部分。
  useEffect(() => {
    initialize();
  }, []);

  // 负责读取当前页面所需的数据，并把结果同步到 state 中。
  // 跟读这个函数时，建议同时留意它依赖了哪些 state/ref，以及执行后会触发哪些界面刷新。
  async function initialize() {
    try {
      const [schoolResp, evidenceResp] = await Promise.all([
        api.get("/admin/schools"),
        api.get("/evidence/all"),
      ]);
      setSchools(schoolResp.data || []);
      setEvidenceItems(evidenceResp.data?.items || []);
      await load();
    } catch (e) {
      message.error(e.message || "初始化跨校考试总览失败");
    }
  }

  // 负责读取当前页面所需的数据，并把结果同步到 state 中。
  // 跟读这个函数时，建议同时留意它依赖了哪些 state/ref，以及执行后会触发哪些界面刷新。
  async function load(nextFilters = filters) {
    setLoading(true);
    try {
      const r = await api.get("/admin/exams", {
        params: {
          schoolId: nextFilters.schoolId,
          status: nextFilters.status,
          keyword: nextFilters.keyword || undefined,
        },
      });
      setList(r.data || []);
    } catch (e) {
      message.error(e.message || "加载跨校考试失败");
    } finally {
      setLoading(false);
    }
  }

  const schoolOptions = useMemo(
    () => (schools || []).map((item) => ({ value: item.id, label: item.name })),
    [schools],
  );

  const overviewStats = useMemo(() => ({
    examCount: list.length,
    runningCount: list.filter((item) => item.status === "RUNNING").length,
    studentCount: list.reduce((sum, item) => sum + Number(item.studentCount || 0), 0),
    evidenceCount: list.reduce((sum, item) => sum + Number(item.evidenceCount || 0), 0),
  }), [list]);

  const anomalyDistribution = useMemo(() => {
    const visibleExamIds = new Set((list || []).map((item) => Number(item.id)));
    const grouped = new Map();
    (evidenceItems || [])
      .filter((item) => visibleExamIds.has(Number(item.examId)))
      .forEach((item) => {
        const key = item.anomalyLabel || "unknown";
        grouped.set(key, (grouped.get(key) || 0) + 1);
      });
    return [...grouped.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  }, [evidenceItems, list]);

  // 负责把页面中的一段独立交互逻辑拆出来，避免主组件渲染区混入过多细节。
  // 跟读这个函数时，建议同时留意它依赖了哪些 state/ref，以及执行后会触发哪些界面刷新。
  async function viewRooms(record) {
    try {
      const r = await api.get(`/admin/exams/${record.id}/rooms`);
      setRooms(r.data || []);
      setSelectedExam(record);
    } catch (e) {
      message.error(e.message || "加载考场详情失败");
    }
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <Card className="glass-effect" variant={false} style={{ borderRadius: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
          <div>
            <Title level={4} style={{ margin: 0 }}>{tr("跨学校考试总览")}</Title>
            <Text type="secondary">{tr("从平台视角监控全部学校的考试、考场与证据规模")}</Text>
          </div>
          <Space wrap>
            <Select
              allowClear
              value={filters.schoolId}
              placeholder={tr("学校")}
              style={{ width: 180 }}
              options={schoolOptions}
              onChange={(value) => setFilters((prev) => ({ ...prev, schoolId: value }))}
            />
            <Select
              allowClear
              value={filters.status}
              placeholder={tr("考试状态")}
              style={{ width: 140 }}
              options={[
                { value: "NOT_STARTED", label: tr("未开始") },
                { value: "RUNNING", label: tr("进行中") },
                { value: "FINISHED", label: tr("已结束") },
              ]}
              onChange={(value) => setFilters((prev) => ({ ...prev, status: value }))}
            />
            <Input
              allowClear
              prefix={<SearchOutlined />}
              value={filters.keyword}
              placeholder={tr("输入考试名称")}
              style={{ width: 240 }}
              onChange={(e) => setFilters((prev) => ({ ...prev, keyword: e.target.value }))}
              onPressEnter={() => load()}
            />
            <Button icon={<SearchOutlined />} onClick={() => load()}>{tr("查询")}</Button>
            <Button
              icon={<ReloadOutlined />}
              onClick={() => {
                const next = { schoolId: undefined, status: undefined, keyword: "" };
                setFilters(next);
                load(next);
              }}
            >
              {tr("重置")}
            </Button>
          </Space>
        </div>

        <Space wrap size={12} style={{ marginBottom: 16 }}>
          <Card><Statistic title={tr("考试数")} value={overviewStats.examCount} /></Card>
          <Card><Statistic title={tr("进行中")} value={overviewStats.runningCount} /></Card>
          <Card><Statistic title={tr("考生总量")} value={overviewStats.studentCount} /></Card>
          <Card><Statistic title={tr("证据总数")} value={overviewStats.evidenceCount} /></Card>
        </Space>

        {/* <Space wrap style={{ marginBottom: 16 }}>
          {anomalyDistribution.map(([label, count]) => (
            <Tag key={label} color="processing">{label}：{count}</Tag>
          ))}
          {!anomalyDistribution.length && <Text type="secondary">当前筛选范围暂无异常类型分布</Text>}
        </Space> */}

        <Table
          rowKey="id"
          loading={loading}
          dataSource={list}
          pagination={{ pageSize: 10 }}
          scroll={{ x: 1500 }}
          columns={[
            { title: tr("学校"), dataIndex: "schoolName", width: 160 },
            { title: tr("考试名称"), dataIndex: "name", width: 190, ellipsis: true },
            { title: tr("学院"), dataIndex: "departmentName", width: 120, render: (text) => text || "-" },
            { title: tr("专业"), dataIndex: "majorName", width: 120, render: (text) => text || "-" },
            { title: tr("开始时间"), dataIndex: "startAt", width: 170, render: (text) => text || "-" },
            { title: tr("结束时间"), dataIndex: "endAt", width: 170, render: (text) => text || "-" },
            {
              title: tr("状态"),
              dataIndex: "status",
              width: 100,
              render: (value) => <Tag color={statusColorMap[value] || "default"}>{tr(statusLabelMap[value] || "未知")}</Tag>,
            },
            { title: tr("考场数"), dataIndex: "roomCount", width: 90 },
            { title: tr("考生数"), dataIndex: "studentCount", width: 90 },
            { title: tr("证据数"), dataIndex: "evidenceCount", width: 90 },
            {
              title: tr("操作"),
              key: "action",
              width: 130,
              render: (_, record) => <Button type="link" onClick={() => viewRooms(record)}>{tr("查看考场")}</Button>,
            },
          ]}
        />
      </Card>

      <Modal
        title={selectedExam ? tr(`考试《${selectedExam.name}》考场详情`) : tr("考场详情")}
        open={!!selectedExam}
        onCancel={() => {
          setSelectedExam(null);
          setRooms([]);
        }}
        footer={[
          <Button key="close" type="primary" onClick={() => setSelectedExam(null)}>
            {tr("关闭")}
          </Button>,
        ]}
        width={920}
        {...opaqueWhiteModalProps}
      >
        <Table
          rowKey="examRoomId"
          dataSource={rooms}
          pagination={{ pageSize: 8 }}
          columns={[
            { title: tr("房间号"), dataIndex: "roomId", width: 100 },
            { title: tr("监考老师"), key: "invigilator", width: 120, render: (_, row) => row.invigilatorName || `ID:${row.invigilatorId}` },
            { title: tr("容量/已分配"), key: "count", width: 120, render: (_, row) => `${row.capacity} / ${row.studentCount}` },
            { title: tr("考生名单"), key: "students", render: (_, row) => (row.students || []).map((item) => item.studentName).join("、") || "-" },
          ]}
        />
      </Modal>
    </div>
  );
}
