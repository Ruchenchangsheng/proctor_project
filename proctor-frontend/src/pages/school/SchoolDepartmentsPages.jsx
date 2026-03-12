import React, { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { api } from "../../apiClient";
import { Table, Card, Form, Input, Button, Typography, message } from "antd";
import { PlusOutlined, BankOutlined } from "@ant-design/icons";

const { Title } = Typography;

export default function SchoolDepartmentsPages() {
  const { school } = useOutletContext();
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [form] = Form.useForm();

  async function load() {
    if (!school?.id) return;
    setLoading(true);
    try {
      const r = await api.get(`/school/${school.id}/departments`);
      setList(r.data || []);
    } catch (e) {
      message.error(e.message || "加载学院失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [school?.id]);

  async function addDept(values) {
    const name = values.dept.trim();
    if (!name) return;
    try {
      await api.post(`/school/${school.id}/departments`, { name });
      form.resetFields();
      await load();
      message.success("学院已成功添加");
    } catch (e) {
      message.error(e.message || "添加失败");
    }
  }

  const columns = [
    { title: "ID", dataIndex: "id", key: "id", render: (t, r, i) => i + 1, width: 80 },
    { title: "学院名称", dataIndex: "name", key: "name", render: (text) => <><BankOutlined style={{ marginRight: 8, color: '#1677ff' }} />{text}</> },
  ];

  return (
    <div style={{ maxWidth: 1000, margin: "0 auto" }}>
      <Card className="glass-effect" variant={false} style={{ marginBottom: 24, borderRadius: 12 }}>
        <Title level={4} style={{ marginTop: 0, marginBottom: 20 }}>添加学院</Title>
        <Form form={form} layout="inline" onFinish={addDept}>
          <Form.Item name="dept" rules={[{ required: true, message: '请输入学院名称' }]}>
            <Input placeholder="输入学院名称" style={{ width: 250 }} />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" icon={<PlusOutlined />}>
              添加学院
            </Button>
          </Form.Item>
        </Form>
      </Card>

      <Card className="glass-effect" variant={false} style={{ borderRadius: 12 }}>
        <Title level={4} style={{ marginTop: 0, marginBottom: 20 }}>学院列表</Title>
        <Table
          columns={columns}
          dataSource={list}
          rowKey="id"
          loading={loading}
          pagination={{ pageSize: 10 }}
          style={{ background: 'transparent' }}
        />
      </Card>
    </div>
  );
}