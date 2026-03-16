import { useEffect, useMemo, useState } from "react";
import { api } from "../../apiClient";
import { Button, Card, Form, Input, Modal, Popconfirm, Select, Space, Table, Tag, Typography, message } from "antd";
import { EditOutlined, ReloadOutlined, SearchOutlined } from "@ant-design/icons";
import { opaqueWhiteModalProps } from "../school/modalStyles";
import useCatalogTranslation from "../../i18n/useCatalogTranslation";

const { Title, Text } = Typography;

export default function AdminSchoolAdminsPage() {
  const { tr } = useCatalogTranslation();
  const [schools, setSchools] = useState([]);
  const [list, setList] = useState([]);
  const [filters, setFilters] = useState({ schoolId: undefined, enabled: undefined, keyword: "" });
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(null);
  const [editOpen, setEditOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editForm] = Form.useForm();

  useEffect(() => {
    initialize();
  }, []);

  async function initialize() {
    try {
      const schoolResp = await api.get("/admin/schools");
      setSchools(schoolResp.data || []);
      await load();
    } catch (e) {
      message.error(e.message || "初始化学校管理员页面失败");
    }
  }

  async function load(nextFilters = filters) {
    setLoading(true);
    try {
      const r = await api.get("/admin/school-admins", {
        params: {
          schoolId: nextFilters.schoolId,
          enabled: nextFilters.enabled,
          keyword: nextFilters.keyword || undefined,
        },
      });
      setList(r.data || []);
    } catch (e) {
      message.error(e.message || "加载学校管理员失败");
    } finally {
      setLoading(false);
    }
  }

  const schoolOptions = useMemo(
    () => (schools || []).map((item) => ({ value: item.id, label: item.name })),
    [schools],
  );

  function openEdit(record) {
    setEditing(record);
    editForm.setFieldsValue({
      name: record.adminName,
      email: record.adminEmail,
    });
    setEditOpen(true);
  }

  async function submitEdit(values) {
    if (!editing?.userId) return;
    setSaving(true);
    try {
      await api.put(`/admin/school-admins/${editing.userId}`, values);
      message.success("学校管理员信息已更新");
      setEditOpen(false);
      setEditing(null);
      await load();
    } catch (e) {
      message.error(e.message || "更新失败");
    } finally {
      setSaving(false);
    }
  }

  async function toggleEnabled(record, nextEnabled) {
    try {
      await api.post(`/admin/school-admins/${record.userId}/toggle-enabled`, { enabled: nextEnabled });
      message.success(nextEnabled ? "学校管理员账号已启用" : "学校管理员账号已停用");
      await load();
    } catch (e) {
      message.error(e.message || "操作失败");
    }
  }

  async function resetPassword(record) {
    try {
      const r = await api.post(`/admin/school-admins/${record.userId}/reset-password`);
      Modal.success({
        title: tr("密码已重置"),
        content: (
          <div>
            <div>{tr("临时密码")}：<strong>{r.data?.tempPassword}</strong></div>
            <div>{tr("邮件发送")}：{r.data?.mailSent ? tr("成功") : tr("失败，请手动通知")}</div>
          </div>
        ),
      });
    } catch (e) {
      message.error(e.message || "重置密码失败");
    }
  }

  return (
    <Card className="glass-effect" variant={false} style={{ borderRadius: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
        <div>
          <Title level={4} style={{ margin: 0 }}>{tr("学校管理员账号管理")}</Title>
          <Text type="secondary">{tr("支持跨学校检索、冻结与重置密码")}</Text>
        </div>
        <Space wrap>
          <Select
            allowClear
            placeholder={tr("学校")}
            style={{ width: 180 }}
            value={filters.schoolId}
            options={schoolOptions}
            onChange={(value) => setFilters((prev) => ({ ...prev, schoolId: value }))}
          />
          <Select
            allowClear
            placeholder={tr("账号状态")}
            style={{ width: 140 }}
            value={filters.enabled}
            options={[
              { value: 1, label: tr("已启用") },
              { value: 0, label: tr("已停用") },
            ]}
            onChange={(value) => setFilters((prev) => ({ ...prev, enabled: value }))}
          />
          <Input
            allowClear
            prefix={<SearchOutlined />}
            value={filters.keyword}
            placeholder={tr("输入学校/姓名/邮箱")}
            style={{ width: 260 }}
            onChange={(e) => setFilters((prev) => ({ ...prev, keyword: e.target.value }))}
            onPressEnter={() => load()}
          />
          <Button icon={<SearchOutlined />} onClick={() => load()}>{tr("查询")}</Button>
          <Button
            icon={<ReloadOutlined />}
            onClick={() => {
              const next = { schoolId: undefined, enabled: undefined, keyword: "" };
              setFilters(next);
              load(next);
            }}
          >
            {tr("重置")}
          </Button>
        </Space>
      </div>

      <Table
        rowKey="userId"
        loading={loading}
        dataSource={list}
        pagination={{ pageSize: 10 }}
        scroll={{ x: 1180 }}
        columns={[
          { title: tr("学校"), dataIndex: "schoolName", width: 180 },
          { title: tr("管理员姓名"), dataIndex: "adminName", width: 140 },
          { title: tr("管理员邮箱"), dataIndex: "adminEmail", width: 220 },
          { title: tr("学校邮箱域"), dataIndex: "schoolDomain", width: 180, render: (text) => text || "-" },
          { title: tr("创建时间"), dataIndex: "createdAt", width: 180 },
          {
            title: tr("状态"),
            dataIndex: "enabled",
            width: 100,
            render: (value) => <Tag color={Number(value) === 1 ? "success" : "default"}>{Number(value) === 1 ? tr("已启用") : tr("已停用")}</Tag>,
          },
          {
            title: tr("操作"),
            key: "action",
            width: 260,
            render: (_, record) => (
              <Space size={4} wrap>
                <Button type="link" icon={<EditOutlined />} onClick={() => openEdit(record)}>{tr("修改")}</Button>
                <Button type="link" onClick={() => resetPassword(record)}>{tr("重置密码")}</Button>
                <Popconfirm
                  title={Number(record.enabled) === 1 ? tr("确认冻结该账号吗？") : tr("确认启用该账号吗？")}
                  onConfirm={() => toggleEnabled(record, Number(record.enabled) !== 1)}
                  okText={tr("确认")}
                  cancelText={tr("取消")}
                >
                  <Button type="link" danger={Number(record.enabled) === 1}>
                    {Number(record.enabled) === 1 ? tr("冻结账号") : tr("启用账号")}
                  </Button>
                </Popconfirm>
              </Space>
            ),
          },
        ]}
      />

      <Modal
        title={tr("修改学校管理员")}
        open={editOpen}
        onCancel={() => {
          setEditOpen(false);
          setEditing(null);
          editForm.resetFields();
        }}
        onOk={() => editForm.submit()}
        confirmLoading={saving}
        okText={tr("保存")}
        cancelText={tr("取消")}
        {...opaqueWhiteModalProps}
      >
        <Form form={editForm} layout="vertical" onFinish={submitEdit}>
          <Form.Item name="name" label={tr("管理员姓名")} rules={[{ required: true, message: tr("请输入管理员姓名") }]}>
            <Input placeholder={tr("输入管理员姓名")} />
          </Form.Item>
          <Form.Item name="email" label={tr("管理员邮箱")} rules={[{ required: true, message: tr("请输入管理员邮箱") }, { type: "email", message: tr("邮箱格式不正确") }]}>
            <Input placeholder={tr("输入管理员邮箱")} />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
}
