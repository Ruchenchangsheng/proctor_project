import React, { useEffect, useState } from "react";
import { api } from "../../apiClient";
import { Card, Form, Input, Select, Button, Upload, Typography, message, Row, Col, List } from "antd";
import { PlusOutlined, UploadOutlined } from "@ant-design/icons";

const { Title, Text } = Typography;

export default function School() {
  const [school, setSchool] = useState(null);
  const [departments, setDepts] = useState([]);
  const [majors, setMajors] = useState([]);

  useEffect(() => {
    (async () => {
      try {
        const s = await api.get("/school/my");
        setSchool(s.data);
        const d = await api.get(`/school/${s.data.id}/departments`);
        setDepts(d.data || []);
      } catch (e) { message.error("加载数据失败: " + e.message); }
    })();
  }, []);

  async function addDept(values) {
    const name = values.dept.trim(); if (!name) return;
    try {
      await api.post(`/school/${school.id}/departments`, { name });
      const d = await api.get(`/school/${school.id}/departments`);
      setDepts(d.data || []);
      message.success("学院已添加");
    } catch (e) { message.error(e.message); }
  }

  async function addMajor(values) {
    const departmentId = Number(values.departmentId);
    const name = values.major.trim();
    try {
      await api.post(`/school/${school.id}/majors`, { departmentId, name });
      const m = await api.get(`/school/${school.id}/majors?departmentId=${departmentId}`);
      setMajors(m.data || []);
      message.success("专业已添加");
    } catch (e) { message.error(e.message); }
  }

  async function addTeacher(values) {
    const payload = { email: values.t_email, name: values.t_name, departmentId: Number(values.t_departmentId) };
    try {
      await api.post(`/school/${school.id}/teachers`, payload);
      message.success("已创建老师账号并通过邮件发送密码");
    } catch (e) { message.error(e.message); }
  }

  async function addStudent(values) {
    if (!values.photo || values.photo.fileList.length === 0) {
      message.error("请上传照片"); return;
    }
    const fd = new FormData();
    fd.append("name", values.name);
    fd.append("email", values.email);
    fd.append("departmentId", values.departmentId);
    if (values.majorId) fd.append("majorId", values.majorId);
    fd.append("photo", values.photo.fileList[0].originFileObj);

    try {
      await api.post(`/school/${school.id}/students`, fd);
      message.success("已创建学生账号并发送密码（已提取人脸特征）");
    } catch (e) { message.error(e.message); }
  }

  if (!school) return <div style={{ padding: 50, textAlign: 'center' }}>加载中...</div>;

  const deptOptions = departments.map(d => ({ value: d.id, label: d.name }));

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: "20px" }}>
      <Title level={2} style={{ color: '#333', marginBottom: 24 }}>学校管理员：{school.name}</Title>

      <Row gutter={[24, 24]}>
        {/* 左侧两列：添加学院和添加专业 */}
        <Col xs={24} md={12}>
          <Card className="glass-effect" title="1) 添加学院" variant={false} style={{ borderRadius: 12, height: '100%' }}>
            <Form layout="inline" onFinish={addDept}>
              <Form.Item name="dept" rules={[{ required: true }]}>
                <Input placeholder="学院名称" />
              </Form.Item>
              <Form.Item>
                <Button type="primary" htmlType="submit" icon={<PlusOutlined />}>添加学院</Button>
              </Form.Item>
            </Form>
          </Card>
        </Col>

        <Col xs={24} md={12}>
          <Card className="glass-effect" title="2) 添加专业" variant={false} style={{ borderRadius: 12, height: '100%' }}>
            <Form layout="inline" onFinish={addMajor}>
              <Form.Item name="departmentId" rules={[{ required: true }]}>
                <Select placeholder="选择学院" options={deptOptions} style={{ width: 150 }} />
              </Form.Item>
              <Form.Item name="major" rules={[{ required: true }]}>
                <Input placeholder="专业名称" style={{ width: 150 }} />
              </Form.Item>
              <Form.Item>
                <Button type="primary" htmlType="submit" icon={<PlusOutlined />}>添加专业</Button>
              </Form.Item>
            </Form>

            {majors.length > 0 && (
              <List
                size="small"
                style={{ marginTop: 16 }}
                header={<div>专业预览</div>}
                bordered
                dataSource={majors}
                renderItem={(item) => <List.Item>{item.name}</List.Item>}
              />
            )}
          </Card>
        </Col>

        {/* 右侧两列：添加老师和添加学生 */}
        <Col xs={24} md={12}>
          <Card className="glass-effect" title="3) 添加监考老师" variant={false} style={{ borderRadius: 12, height: '100%' }}>
            <Form layout="vertical" onFinish={addTeacher}>
              <Form.Item name="t_name" label="姓名" rules={[{ required: true }]}>
                <Input placeholder="输入老师姓名" />
              </Form.Item>
              <Form.Item name="t_email" label="邮箱" rules={[{ required: true, type: 'email' }]}>
                <Input placeholder="输入老师邮箱" />
              </Form.Item>
              <Form.Item name="t_departmentId" label="所属学院" rules={[{ required: true }]}>
                <Select placeholder="选择学院" options={deptOptions} />
              </Form.Item>
              <Form.Item>
                <Button type="primary" htmlType="submit" block>创建老师账号</Button>
              </Form.Item>
            </Form>
          </Card>
        </Col>

        <Col xs={24} md={12}>
          <Card className="glass-effect" title="4) 添加考生（含证件照）" variant={false} style={{ borderRadius: 12, height: '100%' }}>
            <Form layout="vertical" onFinish={addStudent}>
              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item name="name" label="姓名" rules={[{ required: true }]}>
                    <Input placeholder="考生姓名" />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="email" label="邮箱" rules={[{ required: true, type: 'email' }]}>
                    <Input placeholder="考生邮箱" />
                  </Form.Item>
                </Col>
              </Row>
              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item name="departmentId" label="所属学院" rules={[{ required: true }]}>
                    <Select placeholder="选择学院" options={deptOptions} />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="majorId" label="专业ID (可选)">
                    <Input placeholder="输入专业ID" />
                  </Form.Item>
                </Col>
              </Row>
              <Form.Item name="photo" label="证件照" rules={[{ required: true }]}>
                <Upload beforeUpload={() => false} maxCount={1} accept="image/*">
                  <Button icon={<UploadOutlined />}>点击选择照片</Button>
                </Upload>
              </Form.Item>
              <Form.Item style={{ marginBottom: 0 }}>
                <Button type="primary" htmlType="submit" block>创建学生账号</Button>
              </Form.Item>
            </Form>
          </Card>
        </Col>
      </Row>
    </div>
  );
}