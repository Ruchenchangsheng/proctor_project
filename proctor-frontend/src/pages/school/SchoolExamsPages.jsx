// SchoolExamsPages 展示学校已创建考试及其运行状态，是考试管理总览页。
import { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { Button, Card, Input, Modal, Popconfirm, Select, Space, Table, Tag, Typography, message, Form } from "antd";
import { ReloadOutlined, SearchOutlined, EditOutlined, DeleteOutlined, DownloadOutlined } from "@ant-design/icons";
import { api } from "../../apiClient";
import { opaqueWhiteModalProps } from "../../css/modalStyles";
import useCatalogTranslation from "../../i18n/useCatalogTranslation";

const { Title } = Typography;

const statusColorMap = {
  NOT_STARTED: "blue",
  RUNNING: "green",
  FINISHED: "default",
};

const statusLabelMap = {
  NOT_STARTED: "未开始",
  RUNNING: "进行中",
  FINISHED: "已结束",
};

export default function SchoolExamsPages() {
  const { school } = useOutletContext();
  const { tr, language } = useCatalogTranslation();
  const [departments, setDepartments] = useState([]);
  const [majors, setMajors] = useState([]);
  const [evidenceItems, setEvidenceItems] = useState([]);
  const [filters, setFilters] = useState({
    departmentId: undefined,
    majorId: undefined,
    keyword: "",
    status: undefined,
  });
  const [listLoading, setListLoading] = useState(false);
  const [examList, setExamList] = useState([]);
  const [selectedExamId, setSelectedExamId] = useState("");
  const [rooms, setRooms] = useState([]);
  const [editingExam, setEditingExam] = useState(null);
  const [editOpen, setEditOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editForm] = Form.useForm();

  // 这个 effect 负责在依赖变化时同步加载数据或建立/释放副作用。
  // 阅读时可以重点看依赖数组、内部异步流程以及 return 清理逻辑三部分。
  useEffect(() => {
    if (!school?.id) return;
    initialize();
  }, [school?.id]);

  // 负责读取当前页面所需的数据，并把结果同步到 state 中。
  // 跟读这个函数时，建议同时留意它依赖了哪些 state/ref，以及执行后会触发哪些界面刷新。
  async function initialize() {
    try {
      const [deptResp, evidenceResp] = await Promise.all([
        api.get(`/school/${school.id}/departments`),
        api.get(`/evidence/school/${school.id}`),
      ]);
      const deptList = deptResp.data || [];
      setEvidenceItems(evidenceResp.data?.items || []);
      setDepartments(deptList);
      const firstDeptId = deptList[0]?.id;
      let majorList = [];
      let firstMajorId;
      if (firstDeptId) {
        majorList = await fetchMajors(firstDeptId);
        firstMajorId = majorList[0]?.id;
      }
      setMajors(majorList);
      const nextFilters = {
        departmentId: firstDeptId,
        majorId: firstMajorId,
        keyword: "",
        status: undefined,
      };
      setFilters(nextFilters);
      await loadExams(nextFilters);
    } catch (err) {
      message.error(err.message || tr("初始化考试管理失败"));
    }
  }

  // 负责读取当前页面所需的数据，并把结果同步到 state 中。
  // 跟读这个函数时，建议同时留意它依赖了哪些 state/ref，以及执行后会触发哪些界面刷新。
  async function fetchMajors(departmentId) {
    if (!departmentId) return [];
    const r = await api.get(`/school/${school.id}/majors`, { params: { departmentId } });
    return r.data || [];
  }

  // 负责读取当前页面所需的数据，并把结果同步到 state 中。
  // 跟读这个函数时，建议同时留意它依赖了哪些 state/ref，以及执行后会触发哪些界面刷新。
  async function loadExams(nextFilters = filters) {
    setListLoading(true);
    try {
      const r = await api.get(`/school/${school.id}/exams`, {
        params: {
          departmentId: nextFilters.departmentId || undefined,
          majorId: nextFilters.majorId || undefined,
          keyword: nextFilters.keyword || undefined,
          status: nextFilters.status || undefined,
        },
      });
      setExamList(r.data || []);
    } catch (err) {
      message.error(err.message || tr("加载考试列表失败"));
    } finally {
      setListLoading(false);
    }
  }

  // 负责把页面中的一段独立交互逻辑拆出来，避免主组件渲染区混入过多细节。
  // 跟读这个函数时，建议同时留意它依赖了哪些 state/ref，以及执行后会触发哪些界面刷新。
  async function viewRooms(examId) {
    if (!examId) return;
    setListLoading(true);
    try {
      const r = await api.get(`/school/${school.id}/exams/${examId}/rooms`);
      setRooms(r.data || []);
      setSelectedExamId(String(examId));
    } catch (err) {
      message.error(err.message || tr("加载考场分配失败"));
    } finally {
      setListLoading(false);
    }
  }

  // 负责把页面中的一段独立交互逻辑拆出来，避免主组件渲染区混入过多细节。
  // 跟读这个函数时，建议同时留意它依赖了哪些 state/ref，以及执行后会触发哪些界面刷新。
  async function onDepartmentChange(value) {
    const majorList = await fetchMajors(value);
    const nextFilters = {
      ...filters,
      departmentId: value,
      majorId: majorList[0]?.id,
    };
    setMajors(majorList);
    setFilters(nextFilters);
    await loadExams(nextFilters);
  }

  // 负责把页面中的一段独立交互逻辑拆出来，避免主组件渲染区混入过多细节。
  // 跟读这个函数时，建议同时留意它依赖了哪些 state/ref，以及执行后会触发哪些界面刷新。
  async function onMajorChange(value) {
    const nextFilters = { ...filters, majorId: value };
    setFilters(nextFilters);
    await loadExams(nextFilters);
  }

  // 负责读取当前页面所需的数据，并把结果同步到 state 中。
  // 跟读这个函数时，建议同时留意它依赖了哪些 state/ref，以及执行后会触发哪些界面刷新。
  function getStatusMeta(record) {
    const key = record?.status || "NOT_STARTED";
    return {
      label: tr(statusLabelMap[key] || "未知"),
      color: statusColorMap[key] || "default",
    };
  }

  // 负责处理当前页面的提交型交互，并在成功后刷新界面状态。
  // 跟读这个函数时，建议同时留意它依赖了哪些 state/ref，以及执行后会触发哪些界面刷新。
  function openEdit(record) {
    if (record?.status !== "NOT_STARTED") {
      message.warning(tr("仅待开始状态的考试允许修改"));
      return;
    }
    setEditingExam(record);
    editForm.setFieldsValue({
      name: record.name,
      startAt: record.startAt ? String(record.startAt).replace(" ", "T").slice(0, 16) : undefined,
      endAt: record.endAt ? String(record.endAt).replace(" ", "T").slice(0, 16) : undefined,
    });
    setEditOpen(true);
  }

  // 负责处理当前页面的提交型交互，并在成功后刷新界面状态。
  // 跟读这个函数时，建议同时留意它依赖了哪些 state/ref，以及执行后会触发哪些界面刷新。
  async function submitEdit(values) {
    if (!editingExam?.id) return;
    setSaving(true);
    try {
      await api.put(`/school/${school.id}/exams/${editingExam.id}`, {
        name: values.name?.trim(),
        startAt: values.startAt || null,
        endAt: values.endAt || null,
      });
      setEditOpen(false);
      setEditingExam(null);
      await loadExams();
      message.success(tr("考试信息已更新"));
    } catch (err) {
      message.error(err.message || tr("更新失败"));
    } finally {
      setSaving(false);
    }
  }

  // 负责切换界面状态或执行带副作用的收尾动作。
  // 跟读这个函数时，建议同时留意它依赖了哪些 state/ref，以及执行后会触发哪些界面刷新。
  async function removeExam(record) {
    try {
      await api.delete(`/school/${school.id}/exams/${record.id}`);
      await loadExams();
      message.success(tr("考试已删除"));
    } catch (err) {
      message.error(err.message || tr("删除失败"));
    }
  }

  // 负责把页面中的一段独立交互逻辑拆出来，避免主组件渲染区混入过多细节。
  // 跟读这个函数时，建议同时留意它依赖了哪些 state/ref，以及执行后会触发哪些界面刷新。
  async function exportResults(record) {
    try {
      const res = await api.get(`/school/${school.id}/exams/${record.id}/results/export`, { responseType: "blob" });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = `exam-results-${record.id}.csv`;
      a.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 30000);
    } catch (err) {
      message.error(err.message || tr("导出考试结果失败"));
    }
  }

  // 表格列配置集中描述了当前页面最核心的展示字段和每列的交互行为。
  // 如果你想理解页面允许用户做什么，优先看这里的 render、按钮和状态标签。
  const columns = [
    { title: tr("考试名称"), dataIndex: "name", width: 180, ellipsis: true },
    { title: tr("学院"), dataIndex: "departmentName", width: 120, ellipsis: true, render: (text) => text || "-" },
    { title: tr("专业"), dataIndex: "majorName", width: 130, ellipsis: true, render: (text) => text || "-" },
    { title: tr("开始时间"), dataIndex: "startAt", width: 170, render: (text) => text || "-" },
    { title: tr("结束时间"), dataIndex: "endAt", width: 170, render: (text) => text || "-" },
    {
      title: tr("考试状态"),
      key: "status",
      width: 110,
      render: (_, record) => {
        const status = getStatusMeta(record);
        return <Tag color={status.color}>{status.label}</Tag>;
      },
    },
    {
      title: tr("操作"),
          key: "action",
      width: 400,
      render: (_, record) => (
        <Space size={4} wrap>
          <Button type="link" onClick={() => viewRooms(record.id)}>{tr("查看考场分配")}</Button>
          <Button type="link" icon={<DownloadOutlined />} onClick={() => exportResults(record)}>{tr("导出结果")}</Button>
          <Button
            type="link"
            icon={<EditOutlined />}
            disabled={record.status !== "NOT_STARTED"}
            onClick={() => openEdit(record)}
          >
            {tr("修改")}
          </Button>
          <Popconfirm
            title={tr("确定删除该考试吗？")}
            description={tr("进行中的考试不允许删除，删除后会同步清理考场与考试会话。")}
            onConfirm={() => removeExam(record)}
            okText={tr("删除")}
            cancelText={tr("取消")}
          >
            <Button type="link" danger icon={<DeleteOutlined />}>{tr("删除")}</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const summary = {
    examCount: examList.length,
    runningCount: examList.filter((item) => item.status === "RUNNING").length,
    evidenceCount: evidenceItems.length,
    anomalyCount: evidenceItems.length,
  };

  return (
    <div style={{ width: "100%", maxWidth: "none", margin: "0 auto" }}>
      <Card className="glass-effect" variant={false} style={{ borderRadius: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, gap: 12, flexWrap: "wrap" }}>
          <Title level={4} style={{ margin: 0 }}>{tr("考试与考场总览")}</Title>
          <Space wrap>
            <Select
              value={filters.departmentId}
              style={{ width: 180 }}
              placeholder={tr("学院")}
              onChange={onDepartmentChange}
              options={departments.map((item) => ({ value: item.id, label: item.name }))}
            />
            <Select
              value={filters.majorId}
              style={{ width: 180 }}
              placeholder={tr("专业")}
              onChange={onMajorChange}
              disabled={!majors.length}
              options={majors.map((item) => ({ value: item.id, label: item.name }))}
            />
            <Select
              allowClear
              value={filters.status}
              style={{ width: 140 }}
              placeholder={tr("考试状态")}
              onChange={(value) => setFilters((prev) => ({ ...prev, status: value }))}
              options={[
                { value: "NOT_STARTED", label: tr("未开始") },
                { value: "RUNNING", label: tr("进行中") },
                { value: "FINISHED", label: tr("已结束") },
              ]}
            />
            <Input
              allowClear
              value={filters.keyword}
              placeholder={tr("输入考试名称")}
              style={{ width: 220 }}
              onChange={(e) => setFilters((prev) => ({ ...prev, keyword: e.target.value }))}
              onPressEnter={() => loadExams()}
            />
            <Button icon={<SearchOutlined />} onClick={() => loadExams()}>{tr("查询")}</Button>
            <Button
              icon={<ReloadOutlined />}
              onClick={() => {
                const nextFilters = {
                  departmentId: filters.departmentId,
                  majorId: filters.majorId,
                  keyword: "",
                  status: undefined,
                };
                setFilters(nextFilters);
                loadExams(nextFilters);
              }}
            >
                {tr("重置")}
              </Button>
            </Space>
          </div>
        <Space wrap style={{ marginBottom: 16 }}>
          <Tag color="processing">{tr("考试数")} {summary.examCount}</Tag>
          <Tag color="green">{tr("进行中")} {summary.runningCount}</Tag>
          <Tag color="warning">{tr("异常数")} {summary.anomalyCount}</Tag>
          <Tag color="error">{tr("证据数")} {summary.evidenceCount}</Tag>
        </Space>
        <Table
          columns={columns}
          dataSource={examList}
          rowKey="id"
          loading={listLoading}
          pagination={{ pageSize: 10 }}
          scroll={{ x: 1280 }}
          style={{ background: "transparent" }}
        />
      </Card>

      <Modal
        title={selectedExamId ? tr(`考试 ${selectedExamId} 的考场分配详情`) : ""}
        open={!!selectedExamId}
        onCancel={() => setSelectedExamId("")}
        width={900}
        footer={[
          <Button key="close" type="primary" onClick={() => setSelectedExamId("")}>
            {tr("关闭")}
          </Button>,
        ]}
        {...opaqueWhiteModalProps}
      >
        <Table
          size="middle"
          style={{ backgroundColor: "white", borderRadius: "8px" }}
          columns={[
            { title: tr("房间号"), dataIndex: "roomId", width: 100 },
            { title: tr("监考老师"), key: "teacher", render: (_, row) => row.invigilatorName || `ID: ${row.invigilatorId}`, width: 120 },
            { title: tr("容量/已分配"), key: "count", render: (_, row) => `${row.capacity} / ${row.studentCount}`, width: 120 },
            { title: tr("考生名单"), key: "students", render: (_, row) => (row.students || []).map((item) => item.studentName).join("、") || "-" },
          ]}
          dataSource={rooms}
          rowKey="examRoomId"
          pagination={{ pageSize: 8 }}
        />
      </Modal>

      <Modal
        title={tr("修改考试")}
        open={editOpen}
        onCancel={() => {
          setEditOpen(false);
          setEditingExam(null);
          editForm.resetFields();
        }}
        onOk={() => editForm.submit()}
        confirmLoading={saving}
        okText={tr("保存")}
        cancelText={tr("取消")}
        {...opaqueWhiteModalProps}
      >
        <Form form={editForm} layout="vertical" onFinish={submitEdit}>
          <Form.Item name="name" label={tr("考试名称")} rules={[{ required: true, message: tr("请输入考试名称") }]}>
            <Input placeholder={tr("输入考试名称")} />
          </Form.Item>
          <Form.Item name="startAt" label={tr("开始时间")} rules={[{ required: true, message: tr("请选择开始时间") }]}>
            <Input key={`edit-start-${language}`} type="datetime-local" lang={language} />
          </Form.Item>
          <Form.Item name="endAt" label={tr("结束时间")} rules={[{ required: true, message: tr("请选择结束时间") }]}>
            <Input key={`edit-end-${language}`} type="datetime-local" lang={language} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
