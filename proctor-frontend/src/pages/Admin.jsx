// Admin 页面负责平台管理员维护学校列表、新增学校等平台级操作。
import { useEffect, useState } from "react";
import { api } from "../apiClient";
import { Button, Card, Form, Input, Modal, Popconfirm, Select, Space, Table, Tag, Typography, message } from "antd";
import { EditOutlined, PlusOutlined, ReloadOutlined, SearchOutlined } from "@ant-design/icons";
import { opaqueWhiteModalProps } from "./school/modalStyles";

const { Title, Text } = Typography;

const schoolStatusOptions = [
  { value: 1, label: "已启用" },
  { value: 0, label: "已停用" },
];

export default function Admin({ mode = "list" }) {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [enabled, setEnabled] = useState(undefined);
  const [editingSchool, setEditingSchool] = useState(null);
  const [editOpen, setEditOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();
  const [editForm] = Form.useForm();
  const showAdd = mode === "add";
  const showList = mode === "list";

  // 这个 effect 负责在依赖变化时同步加载数据或建立/释放副作用。
  // 阅读时可以重点看依赖数组、内部异步流程以及 return 清理逻辑三部分。
  useEffect(() => {
    if (showList) {
      load();
    }
  }, [showList]);

  // 负责读取当前页面所需的数据，并把结果同步到 state 中。
  // 跟读这个函数时，建议同时留意它依赖了哪些 state/ref，以及执行后会触发哪些界面刷新。
  async function load(extra = {}) {
    setLoading(true);
    try {
      const nextKeyword = extra.keyword ?? keyword;
      const nextEnabled = extra.enabled ?? enabled;
      const r = await api.get("/admin/schools", {
        params: {
          keyword: nextKeyword || undefined,
          enabled: nextEnabled,
        },
      });
      setList(r.data || []);
    } catch (e) {
      message.error(e.message || "加载学校列表失败");
    } finally {
      setLoading(false);
    }
  }

  // 负责处理当前页面的提交型交互，并在成功后刷新界面状态。
  // 跟读这个函数时，建议同时留意它依赖了哪些 state/ref，以及执行后会触发哪些界面刷新。
  async function onFinish(values) {
    setSaving(true);
    try {
      const res = await api.post("/admin/schools", values);
      message.success(res.data?.mailSent === false ? "学校创建成功，邮件发送失败，请手动通知管理员" : "学校创建成功");
      form.resetFields();
    } catch (e) {
      message.error(e.message || "创建失败");
    } finally {
      setSaving(false);
    }
  }

  // 负责处理当前页面的提交型交互，并在成功后刷新界面状态。
  // 跟读这个函数时，建议同时留意它依赖了哪些 state/ref，以及执行后会触发哪些界面刷新。
  function openEdit(record) {
    setEditingSchool(record);
    editForm.setFieldsValue({
      schoolName: record.name,
      domain: record.domain,
      adminName: record.adminName,
      adminEmail: record.adminEmail,
    });
    setEditOpen(true);
  }

  // 负责处理当前页面的提交型交互，并在成功后刷新界面状态。
  // 跟读这个函数时，建议同时留意它依赖了哪些 state/ref，以及执行后会触发哪些界面刷新。
  async function submitEdit(values) {
    if (!editingSchool?.id) return;
    setSaving(true);
    try {
      await api.put(`/admin/schools/${editingSchool.id}`, values);
      message.success("学校信息已更新");
      setEditOpen(false);
      setEditingSchool(null);
      await load();
    } catch (e) {
      message.error(e.message || "更新失败");
    } finally {
      setSaving(false);
    }
  }

  // 负责切换界面状态或执行带副作用的收尾动作。
  // 跟读这个函数时，建议同时留意它依赖了哪些 state/ref，以及执行后会触发哪些界面刷新。
  async function toggleSchool(record, nextEnabled) {
    try {
      const res = await api.post(`/admin/schools/${record.id}/toggle-enabled`, { enabled: nextEnabled });
      message.success(nextEnabled ? `已启用学校，影响账号 ${res.data?.affectedUsers || 0} 个` : `已停用学校，影响账号 ${res.data?.affectedUsers || 0} 个`);
      await load();
    } catch (e) {
      message.error(e.message || "操作失败");
    }
  }

  // 表格列配置集中描述了当前页面最核心的展示字段和每列的交互行为。
  // 如果你想理解页面允许用户做什么，优先看这里的 render、按钮和状态标签。
  const columns = [
    { title: "学校名称", dataIndex: "name", width: 180, ellipsis: true },
    { title: "邮箱域", dataIndex: "domain", width: 180, ellipsis: true, render: (text) => text || "-" },
    { title: "管理员姓名", dataIndex: "adminName", width: 140, render: (text) => text || "-" },
    { title: "管理员邮箱", dataIndex: "adminEmail", width: 220, ellipsis: true, render: (text) => text || "-" },
    {
      title: "学校状态",
      dataIndex: "adminEnabled",
      width: 110,
      render: (value) => <Tag color={Number(value) === 1 ? "success" : "default"}>{Number(value) === 1 ? "已启用" : "已停用"}</Tag>,
    },
    { title: "学院数", dataIndex: "departmentCount", width: 90 },
    { title: "专业数", dataIndex: "majorCount", width: 90 },
    { title: "老师数", dataIndex: "teacherCount", width: 90 },
    { title: "学生数", dataIndex: "studentCount", width: 90 },
    { title: "考试数", dataIndex: "examCount", width: 90 },
    { title: "证据数", dataIndex: "evidenceCount", width: 90 },
    {
      title: "操作",
      key: "action",
      width: 240,
      render: (_, record) => (
        <Space size={4} wrap>
          <Button type="link" icon={<EditOutlined />} onClick={() => openEdit(record)}>修改</Button>
          <Popconfirm
            title={Number(record.adminEnabled) === 1 ? "确认停用该学校吗？" : "确认启用该学校吗？"}
            description="当前实现会批量切换该学校管理员、老师、学生账号状态。"
            onConfirm={() => toggleSchool(record, Number(record.adminEnabled) !== 1)}
            okText="确认"
            cancelText="取消"
          >
            <Button type="link" danger={Number(record.adminEnabled) === 1}>
              {Number(record.adminEnabled) === 1 ? "停用学校" : "启用学校"}
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ width: "100%", maxWidth: "none", padding: "4px 0", margin: "0 auto" }}>
      {showAdd && (
        <Card className="glass-effect" variant={false} style={{ borderRadius: 12 }}>
          <Title level={4} style={{ marginTop: 0, marginBottom: 20 }}>添加学校与学校管理员</Title>
          <Form form={form} layout="vertical" onFinish={onFinish}>
            <div className="app-form-grid-2">
              <Form.Item name="schoolName" label="学校名称" rules={[{ required: true, message: "请输入学校名称" }]}>
                <Input placeholder="输入学校名称" />
              </Form.Item>
              <Form.Item name="domain" label="学校邮箱域" rules={[{ required: true, message: "请输入学校邮箱域" }]}>
                <Input placeholder="如 edu.cn 或 xxx.edu.cn" />
              </Form.Item>
              <Form.Item name="adminName" label="管理员姓名" rules={[{ required: true, message: "请输入管理员姓名" }]}>
                <Input placeholder="输入管理员姓名" />
              </Form.Item>
              <Form.Item name="adminEmail" label="管理员邮箱" rules={[{ required: true, message: "请输入管理员邮箱" }, { type: "email", message: "邮箱格式不正确" }]}>
                <Input placeholder="输入管理员邮箱" />
              </Form.Item>
            </div>
            <Button type="primary" htmlType="submit" icon={<PlusOutlined />} loading={saving}>
              创建学校
            </Button>
          </Form>
        </Card>
      )}

      {showList && (
        <Card className="glass-effect" variant={false} style={{ borderRadius: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
            <div>
              <Title level={4} style={{ margin: 0 }}>学校管理</Title>
              <Text type="secondary">支持学校检索、信息维护与整校启停</Text>
            </div>
            <Space wrap>
              <Select
                allowClear
                value={enabled}
                style={{ width: 140 }}
                placeholder="学校状态"
                options={schoolStatusOptions}
                onChange={(value) => setEnabled(value)}
              />
              <Input
                allowClear
                value={keyword}
                placeholder="输入学校/管理员/邮箱"
                style={{ width: 260 }}
                onChange={(e) => setKeyword(e.target.value)}
                onPressEnter={() => load()}
              />
              <Button icon={<SearchOutlined />} onClick={() => load()}>查询</Button>
              <Button
                icon={<ReloadOutlined />}
                onClick={() => {
                  setKeyword("");
                  setEnabled(undefined);
                  load({ keyword: "", enabled: undefined });
                }}
              >
                重置
              </Button>
            </Space>
          </div>
          <Table
            columns={columns}
            dataSource={list}
            rowKey="id"
            loading={loading}
            pagination={{ pageSize: 10 }}
            scroll={{ x: 1500 }}
            style={{ background: "transparent" }}
          />
        </Card>
      )}

      <Modal
        title="修改学校信息"
        open={editOpen}
        onCancel={() => {
          setEditOpen(false);
          setEditingSchool(null);
          editForm.resetFields();
        }}
        onOk={() => editForm.submit()}
        okText="保存"
        cancelText="取消"
        confirmLoading={saving}
        {...opaqueWhiteModalProps}
      >
        <Form form={editForm} layout="vertical" onFinish={submitEdit}>
          <Form.Item name="schoolName" label="学校名称" rules={[{ required: true, message: "请输入学校名称" }]}>
            <Input placeholder="输入学校名称" />
          </Form.Item>
          <Form.Item name="domain" label="学校邮箱域" rules={[{ required: true, message: "请输入学校邮箱域" }]}>
            <Input placeholder="输入学校邮箱域" />
          </Form.Item>
          <Form.Item name="adminName" label="管理员姓名" rules={[{ required: true, message: "请输入管理员姓名" }]}>
            <Input placeholder="输入管理员姓名" />
          </Form.Item>
          <Form.Item name="adminEmail" label="管理员邮箱" rules={[{ required: true, message: "请输入管理员邮箱" }, { type: "email", message: "邮箱格式不正确" }]}>
            <Input placeholder="输入管理员邮箱" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
