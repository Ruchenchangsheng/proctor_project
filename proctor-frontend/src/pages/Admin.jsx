import React, { useEffect, useState } from "react";
import { api } from "../apiClient";
import { Table, Card, Form, Input, Button, Typography, message } from "antd";
import { PlusOutlined } from "@ant-design/icons";

const { Title } = Typography;

export default function Admin() {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form] = Form.useForm(); // 控制表单实例

  async function load() {
    setLoading(true);
    try {
      const r = await api.get("/admin/schools");
      setList(r.data || []);
    } catch (e) {
      message.error(e.message || "加载列表失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function onFinish(values) {
    try {
      await api.post("/admin/schools", values);
      message.success("创建成功（已向管理员邮箱发送初始密码）");
      form.resetFields(); // 清空表单
      await load(); // 刷新列表
    } catch (e) {
      message.error(e.message || "创建失败");
    }
  }

  // Ant Design Table 的列配置
  const columns = [
    {
      title: "学校名称",
      dataIndex: "name",
      key: "name",
    },
    {
      title: "管理员姓名",
      dataIndex: "adminName",
      key: "adminName",
      render: (text) => text || "--",
    },
    {
      title: "管理员邮箱",
      dataIndex: "adminEmail",
      key: "adminEmail",
      render: (text) => text || "--",
    },
  ];

  return (
    <div style={{ padding: "20px 24px", maxWidth: 1200, margin: "0 auto" }}>

      {/* 顶部：添加学校表单区域 */}
      <Card className="glass-effect" variant={false} style={{ marginBottom: 24, borderRadius: 12 }}>
        <Title level={4} style={{ marginTop: 0, marginBottom: 20 }}>添加学校 + 管理员</Title>
        <Form
          form={form}
          layout="inline"
          onFinish={onFinish}
          style={{ gap: '12px 0' }} // 换行时的间距
        >
          <Form.Item name="schoolName" rules={[{ required: true, message: '必填' }]}>
            <Input placeholder="学校名称" />
          </Form.Item>
          <Form.Item name="domain" rules={[{ required: true, message: '必填' }]}>
            <Input placeholder="学校邮箱后缀(如 edu.cn)" />
          </Form.Item>
          <Form.Item name="adminName" rules={[{ required: true, message: '必填' }]}>
            <Input placeholder="管理员姓名" />
          </Form.Item>
          <Form.Item name="adminEmail" rules={[{ required: true, message: '必填' }, { type: 'email', message: '格式不正确' }]}>
            <Input placeholder="管理员邮箱" />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" icon={<PlusOutlined />}>
              创 建
            </Button>
          </Form.Item>
        </Form>
      </Card>

      {/* 底部：学校列表表格区域 */}
      <Card className="glass-effect" variant={false} style={{ borderRadius: 12 }}>
        <Title level={4} style={{ marginTop: 0, marginBottom: 20 }}>学校列表（含管理员）</Title>
        <Table
          columns={columns}
          dataSource={list}
          rowKey={(record, index) => record.id ?? index}
          loading={loading}
          pagination={{ pageSize: 10 }} // 自动分页
          // 让表格的底层也变成透明，配合外层的毛玻璃
          style={{ background: 'transparent' }}
        />
      </Card>

    </div>
  );
}