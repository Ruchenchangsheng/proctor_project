import React, { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { api } from "../../apiClient";
import { Card, Form, Input, InputNumber, Select, Button, Table, Typography, message, Divider, Space, Modal } from "antd";
import { SaveOutlined, FileAddOutlined, ReloadOutlined } from "@ant-design/icons";

const { Title, Text } = Typography;

export default function SchoolExamsPages() {
  const { school } = useOutletContext();
  const [departments, setDepartments] = useState([]);
  const [majors, setMajors] = useState([]);
  
  const [loading, setLoading] = useState(false);
  const [listLoading, setListLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [examList, setExamList] = useState([]);
  const [selectedExamId, setSelectedExamId] = useState("");
  const [rooms, setRooms] = useState([]);
  const [policySaving, setPolicySaving] = useState(false);

  const [policyForm] = Form.useForm();
  const [examForm] = Form.useForm();
  const departmentIdVal = Form.useWatch('departmentId', examForm);

  useEffect(() => {
    if (!school?.id) return;
    (async () => {
      try {
        const d = await api.get(`/school/${school.id}/departments`);
        const list = d.data || [];
        setDepartments(list);
        if (list.length) {
          const firstDeptId = list[0].id;
          examForm.setFieldsValue({ departmentId: firstDeptId });
          await loadMajors(firstDeptId);
        }
        await loadExams();
        await loadAnomalyPolicy();
        
        examForm.setFieldsValue({
          invigilatorScreenWidth: 1920,
          invigilatorScreenHeight: 1080,
          minStudentTileWidth: 320,
          minStudentTileHeight: 240,
        });
      } catch (e) { message.error(e.message); }
    })();
  }, [school?.id]);

  async function loadMajors(departmentId) {
    if (!departmentId) return;
    const m = await api.get(`/school/${school.id}/majors?departmentId=${departmentId}`);
    const majorList = m.data || [];
    setMajors(majorList);
    examForm.setFieldsValue({ majorId: majorList.length ? majorList[0].id : null });
  }

  async function loadExams() {
    if (!school?.id) return;
    setListLoading(true);
    try {
      const r = await api.get(`/school/${school.id}/exams`);
      setExamList(r.data || []);
    } catch (err) { message.error("加载考试列表失败"); } 
    finally { setListLoading(false); }
  }

  async function loadAnomalyPolicy() {
    if (!school?.id) return;
    try {
      const r = await api.get(`/school/${school.id}/anomaly-policy`);
      if (r.data?.ok && r.data?.policy) {
        policyForm.setFieldsValue(r.data.policy);
      }
    } catch (err) { message.error("加载策略失败"); }
  }

  async function saveAnomalyPolicy(values) {
    setPolicySaving(true);
    try {
      const payload = {
        warningThreshold: Number(values.warningThreshold),
        severeThreshold: Number(values.severeThreshold),
        sampleIntervalMs: Number(values.sampleIntervalMs),
        identityVerifyIntervalSec: Number(values.identityVerifyIntervalSec),
      };
      const r = await api.put(`/school/${school.id}/anomaly-policy`, payload);
      if (r.data?.ok && r.data?.policy) {
        policyForm.setFieldsValue(r.data.policy);
        message.success("违规分级阈值已更新");
      }
    } catch (err) { message.error(err.message || "保存失败"); } 
    finally { setPolicySaving(false); }
  }

  // 这里的逻辑已修改：获取数据后直接打开 Modal
  async function viewRooms(examId) {
    if (!examId) return;
    setListLoading(true);
    try {
      const r = await api.get(`/school/${school.id}/exams/${examId}/rooms`);
      setRooms(r.data || []);
      setSelectedExamId(String(examId)); // 设置 ID，触发弹窗显示
    } catch (err) { message.error(err.message); } 
    finally { setListLoading(false); }
  }

  async function onSubmitExam(values) {
    if (!values.departmentId || !values.majorId) {
      message.error("请先选择学院和专业"); return;
    }
    setLoading(true);
    setResult(null);
    try {
      const payload = {
        name: values.name.trim(),
        departmentId: Number(values.departmentId),
        majorId: Number(values.majorId),
        startAt: values.startAt || null,
        endAt: values.endAt || null,
        invigilatorScreenWidth: Number(values.invigilatorScreenWidth),
        invigilatorScreenHeight: Number(values.invigilatorScreenHeight),
        minStudentTileWidth: Number(values.minStudentTileWidth),
        minStudentTileHeight: Number(values.minStudentTileHeight),
        hardCapPerRoom: values.hardCapPerRoom ? Number(values.hardCapPerRoom) : null
      };
      const r = await api.post(`/school/${school.id}/exams`, payload);
      setResult(r.data);
      message.success("考试创建成功，已完成自动分房");
      examForm.resetFields(['name', 'startAt', 'endAt']); 
      await loadExams();
    } catch (err) { message.error(err.message || "创建考试失败"); } 
    finally { setLoading(false); }
  }

  return (
    <div style={{ maxWidth: 1400, margin: "0 auto" }}>
      <Card className="glass-effect" bordered={false} style={{ marginBottom: 24, borderRadius: 12 }}>
        <Title level={4} style={{ marginTop: 0, marginBottom: 20 }}>异常检测分级阈值</Title>
        <Form form={policyForm} layout="inline" onFinish={saveAnomalyPolicy}>
          <Form.Item name="warningThreshold" label="普通违规阈值"><InputNumber min={0} max={1} step={0.01} style={{ width: 100 }} /></Form.Item>
          <Form.Item name="severeThreshold" label="严重违规阈值"><InputNumber min={0} max={1} step={0.01} style={{ width: 100 }} /></Form.Item>
          <Form.Item name="sampleIntervalMs" label="采样间隔(ms)"><InputNumber min={200} max={10000} step={100} style={{ width: 120 }} /></Form.Item>
          <Form.Item name="identityVerifyIntervalSec" label="身份核验间隔(秒)"><InputNumber min={2} max={120} step={1} style={{ width: 100 }} /></Form.Item>
          <Form.Item><Button type="primary" htmlType="submit" loading={policySaving} icon={<SaveOutlined />}>保存阈值</Button></Form.Item>
        </Form>
        <Text type="secondary" style={{ display: 'block', marginTop: 12, fontSize: 13 }}>💡 说明：模型输出的违规概率 ≥ 严重阈值判定为严重违规，否则为普通违规。</Text>
      </Card>
      
      <Card className="glass-effect" bordered={false} style={{ marginBottom: 24, borderRadius: 12 }}>
        <Title level={4} style={{ marginTop: 0, marginBottom: 20 }}>创建考试并自动分房</Title>
        <Form form={examForm} layout="vertical" onFinish={onSubmitExam}>
          <Space align="start" size="large" wrap>
            <Form.Item name="name" label="考试名称" rules={[{ required: true }]}><Input placeholder="输入考试名称" style={{ width: 200 }} /></Form.Item>
            <Form.Item name="departmentId" label="学院" rules={[{ required: true }]}><Select style={{ width: 180 }} onChange={(v) => loadMajors(v)} options={departments.map(d => ({ value: d.id, label: d.name }))} /></Form.Item>
            <Form.Item name="majorId" label="专业" rules={[{ required: true }]}><Select style={{ width: 180 }} disabled={!majors.length} options={majors.map(m => ({ value: m.id, label: m.name }))} /></Form.Item>
            <Form.Item name="startAt" label="开始时间" rules={[{ required: true }]}><Input type="datetime-local" /></Form.Item>
            <Form.Item name="endAt" label="结束时间" rules={[{ required: true }]}><Input type="datetime-local" /></Form.Item>
          </Space>
          <Divider dashed style={{ margin: '12px 0' }} />
          <Space align="start" size="large" wrap>
            <Form.Item name="invigilatorScreenWidth" label="监考屏幕宽(px)"><InputNumber min={1} style={{ width: 140 }} /></Form.Item>
            <Form.Item name="invigilatorScreenHeight" label="监考屏幕高(px)"><InputNumber min={1} style={{ width: 140 }} /></Form.Item>
            <Form.Item name="minStudentTileWidth" label="最小画面宽(px)"><InputNumber min={1} style={{ width: 140 }} /></Form.Item>
            <Form.Item name="minStudentTileHeight" label="最小画面高(px)"><InputNumber min={1} style={{ width: 140 }} /></Form.Item>
            <Form.Item name="hardCapPerRoom" label="单房间硬上限(选填)"><InputNumber min={1} style={{ width: 140 }} placeholder="无限制" /></Form.Item>
          </Space>
          <div style={{ marginTop: 8 }}>
            <Button type="primary" htmlType="submit" size="large" loading={loading} disabled={!majors.length} icon={<FileAddOutlined />}>创建考试并分房</Button>
            {departmentIdVal && !majors.length && <Text type="danger" style={{ marginLeft: 16 }}>当前学院暂无专业，请先创建专业</Text>}
          </div>
        </Form>
      </Card>

      {result && (
        <Card className="glass-effect" bordered={false} style={{ marginBottom: 24, borderRadius: 12, border: '1px solid #52c41a' }}>
          <Title level={4} style={{ color: '#52c41a', marginTop: 0 }}>✅ 自动分房结果</Title>
          <Space split={<Divider type="vertical" />} style={{ marginBottom: 16 }}>
            <Text>名称：<Text strong>{result.examName}</Text></Text>
            <Text>总人数：<Text strong>{result.studentCount}</Text></Text>
            <Text>考场数：<Text strong>{result.roomCount}</Text></Text>
          </Space>
        </Card>
      )}

      <Card className="glass-effect" bordered={false} style={{ borderRadius: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <Title level={4} style={{ margin: 0 }}>考试与考场总览</Title>
          <Button onClick={loadExams} loading={listLoading} icon={<ReloadOutlined />}>刷新列表</Button>
        </div>
        <Table 
          columns={[
            { title: '考试ID', dataIndex: 'id', width: 80 },
            { title: '考试名称', dataIndex: 'name' },
            { title: '学院', dataIndex: 'departmentName', render: t => t || "-" },
            { title: '专业', dataIndex: 'majorName', render: t => t || "-" },
            { title: '开始时间', dataIndex: 'startAt', render: t => t || "-" },
            { title: '结束时间', dataIndex: 'endAt', render: t => t || "-" },
            { 
              title: '操作', 
              key: 'action',
              render: (_, record) => (
                <Button type="link" onClick={() => viewRooms(record.id)} disabled={listLoading}>查看考场分配</Button>
              )
            },
          ]}
          dataSource={examList}
          rowKey="id"
          loading={listLoading}
          pagination={{ pageSize: 5 }}
          style={{ background: 'transparent' }} 
        />
      </Card>

      {/* 这是一个 Ant Design 的模态框组件，用于替代原本直接渲染在页面底部的表格 */}
      <Modal
        title={`考试 ${selectedExamId} 的考场分配详情`}
        open={!!selectedExamId}
        onCancel={() => setSelectedExamId("")}
        width={900}
        footer={[
          <Button key="close" type="primary" onClick={() => setSelectedExamId("")}>关闭</Button>
        ]}

        style={{content:{
          backgroundColor: 'rgba(255, 255, 255)', // 核心透明度修改位置（0.45 可以自行调高或调低）
          backdropFilter:'none',
          border: '1px solid rgba(255, 255, 255, 0.9)', // 高光边框
          WebkitBackdropFilter: 'none',
        }}}
      >
        <Table 
          size="middle"
          style={{ backgroundColor: 'white', borderRadius: '8px' }}
          columns={[
            { title: '房间号', dataIndex: 'roomId', width: 100 },
            { title: '监考老师', key: 'teacher', render: (_, r) => r.invigilatorName || `ID: ${r.invigilatorId}`, width: 120 },
            { title: '容量/已分配', key: 'count', render: (_, r) => `${r.capacity} / ${r.studentCount}`, width: 120 },
            { title: '考生名单', key: 'students', render: (_, r) => (r.students || []).map(s => s.studentName).join("、") || "-" },
          ]}
          dataSource={rooms}
          rowKey="examRoomId"
          pagination={{ pageSize: 8 }}
        />
      </Modal>

    </div>
  );
}