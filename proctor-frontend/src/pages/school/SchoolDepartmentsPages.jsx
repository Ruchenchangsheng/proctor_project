import React, { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { api } from "../../apiClient";
import { Table, Card, Form, Input, Button, Typography, message, Space, Modal, Popconfirm } from "antd";
import { PlusOutlined, BankOutlined, DeleteOutlined, EditOutlined, ReloadOutlined, SearchOutlined } from "@ant-design/icons";
import { opaqueWhiteModalProps } from "./modalStyles";
import useCatalogTranslation from "../../i18n/useCatalogTranslation";

const { Title } = Typography;

export default function SchoolDepartmentsPages({ mode = "list" }) {
  const { school } = useOutletContext();
  const { tr } = useCatalogTranslation();
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [editOpen, setEditOpen] = useState(false);
  const [editingDept, setEditingDept] = useState(null);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();
  const [editForm] = Form.useForm();
  const showAdd = mode === "add";
  const showList = mode === "list";

  async function load(nextKeyword = keyword) {
    if (!school?.id) return;
    setLoading(true);
    try {
      const r = await api.get(`/school/${school.id}/departments`, {
        params: { keyword: nextKeyword || undefined },
      });
      setList(r.data || []);
    } catch (e) {
      message.error(e.message || tr("加载学院失败"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (showList) {
      load("");
    }
  }, [school?.id, showList]);

  async function addDept(values) {
    const name = values.dept?.trim();
    if (!name) return;
    setSaving(true);
    try {
      await api.post(`/school/${school.id}/departments`, { name });
      form.resetFields();
      await load();
      message.success(tr("学院已成功添加"));
    } catch (e) {
      message.error(e.message || tr("添加失败"));
    } finally {
      setSaving(false);
    }
  }

  function openEdit(record) {
    setEditingDept(record);
    editForm.setFieldsValue({ name: record.name });
    setEditOpen(true);
  }

  async function submitEdit(values) {
    if (!editingDept?.id) return;
    setSaving(true);
    try {
      await api.put(`/school/${school.id}/departments/${editingDept.id}`, { name: values.name?.trim() });
      setEditOpen(false);
      setEditingDept(null);
      await load();
      message.success(tr("学院信息已更新"));
    } catch (e) {
      message.error(e.message || tr("更新失败"));
    } finally {
      setSaving(false);
    }
  }

  async function removeDept(record) {
    try {
      await api.delete(`/school/${school.id}/departments/${record.id}`);
      await load();
      message.success(tr("学院已删除"));
    } catch (e) {
      message.error(e.message || tr("删除失败"));
    }
  }

  const columns = [
    {
      title: tr("学院名称"),
      dataIndex: "name",
      key: "name",
      render: (text) => <><BankOutlined style={{ marginRight: 8, color: "#1677ff" }} />{text}</>,
    },
    {
      title: tr("操作"),
      key: "action",
      width: 180,
      render: (_, record) => (
        <Space>
          <Button type="link" icon={<EditOutlined />} onClick={() => openEdit(record)}>{tr("修改")}</Button>
          <Popconfirm
            title={tr("确定删除该学院吗？")}
            description={tr("删除前需要先清空该学院下的专业、老师、学生和考试。")}
            onConfirm={() => removeDept(record)}
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
          <Title level={4} style={{ marginTop: 0, marginBottom: 20 }}>{tr("添加学院")}</Title>
          <Form form={form} layout="inline" onFinish={addDept}>
            <Form.Item name="dept" rules={[{ required: true, message: tr("请输入学院名称") }]}>
              <Input placeholder={tr("输入学院名称")} style={{ width: 250 }} />
            </Form.Item>
            <Form.Item>
              <Button type="primary" htmlType="submit" loading={saving} icon={<PlusOutlined />}>
                {tr("添加学院")}
              </Button>
            </Form.Item>
          </Form>
        </Card>
      )}

      {showList && (
        <Card className="glass-effect" variant={false} style={{ borderRadius: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, gap: 12, flexWrap: "wrap" }}>
            <Title level={4} style={{ margin: 0 }}>{tr("学院列表")}</Title>
            <Space wrap>
              <Input
                allowClear
                value={keyword}
                placeholder={tr("输入学院名称查询")}
                style={{ width: 240 }}
                onChange={(e) => setKeyword(e.target.value)}
                onPressEnter={() => load(keyword)}
              />
              <Button icon={<SearchOutlined />} onClick={() => load(keyword)}>{tr("查询")}</Button>
              <Button
                icon={<ReloadOutlined />}
                onClick={() => {
                  setKeyword("");
                  load("");
                }}
              >
                {tr("重置")}
              </Button>
            </Space>
          </div>
          <Table
            columns={columns}
            dataSource={list}
            rowKey="id"
            loading={loading}
            pagination={{ pageSize: 10 }}
            style={{ background: "transparent" }}
          />
        </Card>
      )}

      {showList && (
        <Modal
          title={tr("修改学院")}
          open={editOpen}
          onCancel={() => {
            setEditOpen(false);
            setEditingDept(null);
            editForm.resetFields();
          }}
          onOk={() => editForm.submit()}
          confirmLoading={saving}
          okText={tr("保存")}
          cancelText={tr("取消")}
          {...opaqueWhiteModalProps}
        >
          <Form form={editForm} layout="vertical" onFinish={submitEdit}>
            <Form.Item name="name" label={tr("学院名称")} rules={[{ required: true, message: tr("请输入学院名称") }]}>
              <Input placeholder={tr("输入学院名称")} />
            </Form.Item>
          </Form>
        </Modal>
      )}
    </div>
  );
}
