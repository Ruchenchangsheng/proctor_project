import React, { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { api } from "../../apiClient";
import { Table, Card, Form, Input, Select, Button, Typography, Space, message } from "antd";
import { UserAddOutlined, ReloadOutlined } from "@ant-design/icons";

const { Title } = Typography;

export default function SchoolTeachersPages() {
  const { school } = useOutletContext();
  const [departments, setDepts] = useState([]);
  const [deptId, setDeptId] = useState(null);
  const [majors, setMajors] = useState([]);
  const [majorId, setMajorId] = useState(null);

  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [form] = Form.useForm();

  async function loadDepartments() {
    try {
      const d = await api.get(`/school/${school.id}/departments`);
      const depts = d.data || [];
      setDepts(depts);
      const first = depts[0]?.id;
      if (first) {
        setDeptId(first);
        form.setFieldsValue({ departmentId: first });
        await onChangeDeptInternal(first, true);
      }
    } catch (e) { message.error("加载学院失败"); }
  }

  async function onChangeDeptInternal(depId, init = false) {
    try {
      const m = await api.get(`/school/${school.id}/majors?departmentId=${depId}`);
      const ms = m.data || [];
      setMajors(ms);
      const firstMajor = ms[0]?.id || null;
      setMajorId(firstMajor);
      form.setFieldsValue({ majorId: firstMajor });
      await loadList(depId, init ? firstMajor : majorId);
    } catch (e) { message.error("加载专业失败"); }
  }

  async function loadList(departmentId, mId) {
    setLoading(true);
    try {
      const r = await api.get(`/school/${school.id}/teachers`, {
        params: { departmentId: departmentId || undefined, majorId: mId || undefined }
      });
      setList(r.data || []);
    } catch (e) {
      message.error("加载老师列表失败: " + e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { if (school?.id) loadDepartments(); }, [school?.id]);

  async function onChangeDept(v) {
    setDeptId(v);
    await onChangeDeptInternal(v);
  }

  async function onChangeMajor(v) {
    setMajorId(v);
    await loadList(deptId, v);
  }

  async function onFinish(values) {
    const payload = {
      name: values.name.trim(),
      email: values.email.trim(),
      departmentId: Number(values.departmentId),
      majorId: Number(values.majorId)
    };
    try {
      await api.post(`/school/${school.id}/teachers`, payload);
      form.resetFields(['name', 'email']);
      message.success("已创建老师账号并发送初始密码");
      await loadList(deptId, majorId);
    } catch (e) { message.error(e.message || "创建失败"); }
  }

  const columns = [
    { title: "ID", dataIndex: "id", key: "id", render: (t, r, i) => i + 1, width: 60 },
    { title: "姓名", dataIndex: "name", key: "name" },
    { title: "邮箱", dataIndex: "email", key: "email" },
    { title: "学院", dataIndex: "departmentName", key: "departmentName", render: t => t || "-" },
    { title: "专业", dataIndex: "majorName", key: "majorName", render: t => t || "-" },
    { title: "创建时间", dataIndex: "createdAt", key: "createdAt", render: t => t || "-" },
  ];

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto" }}>
      <Card className="glass-effect" variant={false} style={{ marginBottom: 24, borderRadius: 12 }}>
        <Title level={4} style={{ marginTop: 0, marginBottom: 20 }}>添加监考老师</Title>
        <Form form={form} layout="inline" onFinish={onFinish} style={{ gap: '12px 0' }}>
          <Form.Item name="name" rules={[{ required: true, message: '必填' }]}>
            <Input placeholder="姓名" />
          </Form.Item>
          <Form.Item name="email" rules={[{ required: true, message: '必填' }, { type: 'email', message: '格式错误' }]}>
            <Input placeholder="邮箱" />
          </Form.Item>
          <Form.Item name="departmentId" rules={[{ required: true, message: '必填' }]}>
            <Select style={{ width: 180 }} onChange={onChangeDept} options={departments.map(d => ({ value: d.id, label: d.name }))} />
          </Form.Item>
          <Form.Item name="majorId" rules={[{ required: true, message: '必填' }]}>
            <Select style={{ width: 180 }} onChange={onChangeMajor} disabled={!majors.length} options={majors.map(m => ({ value: m.id, label: m.name }))} />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" disabled={!majors.length} icon={<UserAddOutlined />}>创建老师账号</Button>
          </Form.Item>
        </Form>
      </Card>

      <Card className="glass-effect" variant={false} style={{ borderRadius: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <Title level={4} style={{ margin: 0 }}>老师列表</Title>
          <Space>
            <Select value={deptId} style={{ width: 150 }} onChange={onChangeDept} options={departments.map(d => ({ value: d.id, label: d.name }))} />
            <Select value={majorId} style={{ width: 150 }} onChange={onChangeMajor} disabled={!majors.length} options={majors.map(m => ({ value: m.id, label: m.name }))} />
            <Button onClick={() => loadList(deptId, majorId)} icon={<ReloadOutlined />}>刷新</Button>
          </Space>
        </div>
        <Table columns={columns} dataSource={list} rowKey="id" loading={loading} pagination={{ pageSize: 10 }} style={{ background: 'transparent' }} />
      </Card>
    </div>
  );
}