import React, { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { api } from "../../apiClient";
import { Table, Card, Form, Input, Select, Button, Typography, message } from "antd";
import { PlusOutlined } from "@ant-design/icons";

const { Title } = Typography;

export default function SchoolMajorsPages() {
  const { school } = useOutletContext();
  const [departments, setDepts] = useState([]);
  const [deptId, setDeptId] = useState(null);
  const [majors, setMajors] = useState([]);
  const [loading, setLoading] = useState(false);
  const [form] = Form.useForm();

  useEffect(() => {
    (async () => {
      if (!school?.id) return;
      try {
        const r = await api.get(`/school/${school.id}/departments`);
        const depts = r.data || [];
        setDepts(depts);
        const first = depts[0]?.id;
        if (first) {
          setDeptId(first);
          form.setFieldsValue({ departmentId: first });
          await loadMajors(first);
        }
      } catch (e) {
        message.error("加载学院失败: " + e.message);
      }
    })();
  }, [school?.id, form]);

  async function loadMajors(did) {
    if (!did) return;
    setLoading(true);
    try {
      const r = await api.get(`/school/${school.id}/majors?departmentId=${did}`);
      setMajors(r.data || []);
    } catch (e) {
      message.error("加载专业失败: " + e.message);
    } finally {
      setLoading(false);
    }
  }

  async function onFinish(values) {
    const name = values.major.trim();
    if (!deptId || !name) return;
    try {
      await api.post(`/school/${school.id}/majors`, { departmentId: Number(deptId), name });
      form.resetFields(['major']); // 只重置输入的专业名称，保留选中的学院
      await loadMajors(deptId);
      message.success("专业已添加");
    } catch (e) { 
      message.error(e.message || "添加失败"); 
    }
  }

  const columns = [
    { title: "ID", dataIndex: "id", key: "id", render: (t, r, i) => i + 1, width: 80 },
    { title: "所属学院", key: "dept", render: (_, record) => departments.find(d => d.id === record.departmentId)?.name || "-" },
    { title: "专业名称", dataIndex: "name", key: "name" },
  ];

  return (
    <div style={{ maxWidth: 1000, margin: "0 auto" }}>
      <Card className="glass-effect" bordered={false} style={{ marginBottom: 24, borderRadius: 12 }}>
        <Title level={4} style={{ marginTop: 0, marginBottom: 20 }}>添加专业</Title>
        <Form form={form} layout="inline" onFinish={onFinish}>
          <Form.Item name="departmentId" rules={[{ required: true, message: '请选择学院' }]}>
            <Select 
              style={{ width: 200 }} 
              placeholder="选择学院"
              onChange={(v) => { setDeptId(v); loadMajors(v); }}
              options={departments.map(d => ({ value: d.id, label: d.name }))}
            />
          </Form.Item>
          <Form.Item name="major" rules={[{ required: true, message: '请输入专业名称' }]}>
            <Input placeholder="专业名称" style={{ width: 200 }} />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" icon={<PlusOutlined />}>添加</Button>
          </Form.Item>
        </Form>
      </Card>

      <Card className="glass-effect" bordered={false} style={{ borderRadius: 12 }}>
        <Title level={4} style={{ marginTop: 0, marginBottom: 20 }}>专业列表</Title>
        <Table 
          columns={columns} 
          dataSource={majors} 
          rowKey="id" 
          loading={loading}
          pagination={{ pageSize: 10 }}
          style={{ background: 'transparent' }} 
        />
      </Card>
    </div>
  );
}