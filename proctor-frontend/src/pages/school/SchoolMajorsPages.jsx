import React, { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { api } from "../../apiClient";
import { Table, Card, Form, Input, Select, Button, Typography, message, Space, Modal, Popconfirm } from "antd";
import { PlusOutlined, DeleteOutlined, EditOutlined, ReloadOutlined, SearchOutlined } from "@ant-design/icons";
import { opaqueWhiteModalProps } from "../../css/modalStyles";
import useCatalogTranslation from "../../i18n/useCatalogTranslation";

const { Title } = Typography;

export default function SchoolMajorsPages({ mode = "list" }) {
  const { school } = useOutletContext();
  const { tr } = useCatalogTranslation();
  const [departments, setDepts] = useState([]);
  const [deptId, setDeptId] = useState(null);
  const [majors, setMajors] = useState([]);
  const [keyword, setKeyword] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editingMajor, setEditingMajor] = useState(null);
  const [form] = Form.useForm();
  const [editForm] = Form.useForm();
  const showAdd = mode === "add";
  const showList = mode === "list";

  useEffect(() => {
    (async () => {
      if (!school?.id) return;
      try {
        const r = await api.get(`/school/${school.id}/departments`);
        const depts = r.data || [];
        setDepts(depts);
        const first = depts[0]?.id || null;
        setDeptId(first);
        form.setFieldsValue({ departmentId: first });
        if (first && showList) {
          await loadMajors(first, "");
        } else {
          setMajors([]);
        }
      } catch (e) {
        message.error(e.message ? `${tr("加载学院失败")}: ${e.message}` : tr("加载学院失败"));
      }
    })();
  }, [school?.id, showList]);

  async function loadMajors(nextDeptId = deptId, nextKeyword = keyword) {
    if (!nextDeptId) {
      setMajors([]);
      return;
    }
    setLoading(true);
    try {
      const r = await api.get(`/school/${school.id}/majors`, {
        params: { departmentId: nextDeptId, keyword: nextKeyword || undefined },
      });
      setMajors(r.data || []);
    } catch (e) {
      message.error(e.message ? `${tr("加载专业失败")}: ${e.message}` : tr("加载专业失败"));
    } finally {
      setLoading(false);
    }
  }

  async function onFinish(values) {
    const name = values.major?.trim();
    if (!deptId || !name) return;
    setSaving(true);
    try {
      await api.post(`/school/${school.id}/majors`, { departmentId: Number(deptId), name });
      form.resetFields(["major"]);
      await loadMajors(deptId, keyword);
      message.success(tr("专业已添加"));
    } catch (e) {
      message.error(e.message || tr("添加失败"));
    } finally {
      setSaving(false);
    }
  }

  function openEdit(record) {
    setEditingMajor(record);
    editForm.setFieldsValue({
      departmentId: record.departmentId,
      name: record.name,
    });
    setEditOpen(true);
  }

  async function submitEdit(values) {
    if (!editingMajor?.id) return;
    setSaving(true);
    try {
      await api.put(`/school/${school.id}/majors/${editingMajor.id}`, {
        departmentId: values.departmentId,
        name: values.name?.trim(),
      });
      setEditOpen(false);
      setEditingMajor(null);
      await loadMajors(deptId, keyword);
      message.success(tr("专业信息已更新"));
    } catch (e) {
      message.error(e.message || tr("更新失败"));
    } finally {
      setSaving(false);
    }
  }

  async function removeMajor(record) {
    try {
      await api.delete(`/school/${school.id}/majors/${record.id}`);
      await loadMajors(deptId, keyword);
      message.success(tr("专业已删除"));
    } catch (e) {
      message.error(e.message || tr("删除失败"));
    }
  }

  const columns = [
    {
      title: tr("所属学院"),
      key: "dept",
      render: (_, record) => departments.find((item) => item.id === record.departmentId)?.name || "-",
    },
    { title: tr("专业名称"), dataIndex: "name", key: "name" },
    {
      title: tr("操作"),
      key: "action",
      width: 180,
      render: (_, record) => (
        <Space>
          <Button type="link" icon={<EditOutlined />} onClick={() => openEdit(record)}>{tr("修改")}</Button>
          <Popconfirm
            title={tr("确定删除该专业吗？")}
            description={tr("删除前需要先清空该专业下的老师、学生和考试。")}
            onConfirm={() => removeMajor(record)}
            okText={tr("删除")}
            cancelText={tr("取消")}
          >
            <Button type="link" danger icon={<DeleteOutlined />}>{tr("删除")}</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ width: "100%", maxWidth: "none", margin: "0 auto" }}>
      {showAdd && (
        <Card className="glass-effect" variant={false} style={{ borderRadius: 12 }}>
          <Title level={4} style={{ marginTop: 0, marginBottom: 20 }}>{tr("添加专业")}</Title>
          <Form form={form} layout="inline" onFinish={onFinish}>
            <Form.Item name="departmentId" rules={[{ required: true, message: tr("请选择学院") }]}>
              <Select
                style={{ width: 220 }}
                placeholder={tr("选择学院")}
                onChange={(value) => {
                  setDeptId(value);
                  if (showList) {
                    loadMajors(value, keyword);
                  }
                }}
                options={departments.map((item) => ({ value: item.id, label: item.name }))}
              />
            </Form.Item>
            <Form.Item name="major" rules={[{ required: true, message: tr("请输入专业名称") }]}>
              <Input placeholder={tr("专业名称")} style={{ width: 220 }} />
            </Form.Item>
            <Form.Item>
              <Button type="primary" htmlType="submit" loading={saving} icon={<PlusOutlined />}>{tr("添加专业")}</Button>
            </Form.Item>
          </Form>
        </Card>
      )}

      {showList && (
        <Card className="glass-effect" variant={false} style={{ borderRadius: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, gap: 12, flexWrap: "wrap" }}>
            <Title level={4} style={{ margin: 0 }}>{tr("专业列表")}</Title>
            <Space wrap>
              <Select
                value={deptId}
                style={{ width: 200 }}
                placeholder={tr("筛选学院")}
                onChange={(value) => {
                  setDeptId(value);
                  loadMajors(value, keyword);
                }}
                options={departments.map((item) => ({ value: item.id, label: item.name }))}
              />
              <Input
                allowClear
                value={keyword}
                placeholder={tr("输入专业名称查询")}
                style={{ width: 220 }}
                onChange={(e) => setKeyword(e.target.value)}
                onPressEnter={() => loadMajors(deptId, keyword)}
              />
              <Button icon={<SearchOutlined />} onClick={() => loadMajors(deptId, keyword)}>{tr("查询")}</Button>
              <Button
                icon={<ReloadOutlined />}
                onClick={() => {
                  setKeyword("");
                  loadMajors(deptId, "");
                }}
              >
                {tr("重置")}
              </Button>
            </Space>
          </div>
          <Table
            columns={columns}
            dataSource={majors}
            rowKey="id"
            loading={loading}
            pagination={{ pageSize: 10 }}
            style={{ background: "transparent" }}
          />
        </Card>
      )}

      {showList && (
        <Modal
          title={tr("修改专业")}
          open={editOpen}
          onCancel={() => {
            setEditOpen(false);
            setEditingMajor(null);
            editForm.resetFields();
          }}
          onOk={() => editForm.submit()}
          confirmLoading={saving}
          okText={tr("保存")}
          cancelText={tr("取消")}
          {...opaqueWhiteModalProps}
        >
          <Form form={editForm} layout="vertical" onFinish={submitEdit}>
            <Form.Item name="departmentId" label={tr("所属学院")} rules={[{ required: true, message: tr("请选择学院") }]}>
              <Select options={departments.map((item) => ({ value: item.id, label: item.name }))} />
            </Form.Item>
            <Form.Item name="name" label={tr("专业名称")} rules={[{ required: true, message: tr("请输入专业名称") }]}>
              <Input placeholder={tr("输入专业名称")} />
            </Form.Item>
          </Form>
        </Modal>
      )}
    </div>
  );
}
