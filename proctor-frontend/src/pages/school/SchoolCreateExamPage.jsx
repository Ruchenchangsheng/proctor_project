import { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { Button, Card, Divider, Form, Input, InputNumber, Select, Space, Tag, Typography, Upload, message } from "antd";
import { FileAddOutlined, UploadOutlined } from "@ant-design/icons";
import { api } from "../../apiClient";
import useCatalogTranslation from "../../i18n/useCatalogTranslation";

const { Title, Text } = Typography;

export default function SchoolCreateExamPage() {
  const { school } = useOutletContext();
  const { tr, language } = useCatalogTranslation();
  const [departments, setDepartments] = useState([]);
  const [majors, setMajors] = useState([]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [importedStudentEmails, setImportedStudentEmails] = useState([]);
  const [examForm] = Form.useForm();
  const departmentIdVal = Form.useWatch("departmentId", examForm);

  useEffect(() => {
    if (!school?.id) return;
    (async () => {
      try {
        const d = await api.get(`/school/${school.id}/departments`);
        const departmentList = d.data || [];
        setDepartments(departmentList);
        if (departmentList.length) {
          const firstDeptId = departmentList[0].id;
          examForm.setFieldsValue({ departmentId: firstDeptId });
          await loadMajors(firstDeptId);
        }
        examForm.setFieldsValue({
          invigilatorScreenWidth: 1920,
          invigilatorScreenHeight: 1080,
          minStudentTileWidth: 320,
          minStudentTileHeight: 240,
        });
      } catch (err) {
        message.error(err.message || tr("加载考试创建信息失败"));
      }
    })();
  }, [school?.id, tr]);

  async function loadMajors(departmentId) {
    if (!departmentId) return;
    try {
      const m = await api.get(`/school/${school.id}/majors?departmentId=${departmentId}`);
      const majorList = m.data || [];
      setMajors(majorList);
      examForm.setFieldsValue({ majorId: majorList.length ? majorList[0].id : null });
    } catch (err) {
      setMajors([]);
      examForm.setFieldsValue({ majorId: null });
      message.error(err.message || tr("加载专业失败"));
    }
  }

  async function onSubmitExam(values) {
    if (!values.departmentId || !values.majorId) {
      message.error(tr("请先选择学院和专业"));
      return;
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
        hardCapPerRoom: values.hardCapPerRoom ? Number(values.hardCapPerRoom) : null,
        studentEmails: importedStudentEmails,
      };
      const r = await api.post(`/school/${school.id}/exams`, payload);
      setResult(r.data);
      message.success(tr("考试创建成功，已完成自动分房"));
      examForm.resetFields(["name", "startAt", "endAt"]);
    } catch (err) {
      message.error(err.message || tr("创建考试失败"));
    } finally {
      setLoading(false);
    }
  }

  async function importRoster(file) {
    try {
      const text = await file.text();
      const lines = text.replace(/\r/g, "").split("\n").map((line) => line.trim()).filter(Boolean);
      if (!lines.length) {
        message.warning(tr("名单文件为空"));
        return false;
      }
      const values = lines.map((line) => line.split(",")[0]?.replace(/\uFEFF/g, "").trim()).filter(Boolean);
      const emails = (values[0] || "").toLowerCase() === "email" ? values.slice(1) : values;
      const deduped = [...new Set(emails)];
      setImportedStudentEmails(deduped);
      message.success(tr(`已导入考试名单 ${deduped.length} 人`));
    } catch (e) {
      message.error(tr("读取名单失败"));
    }
    return false;
  }

  return (
    <div style={{ width: "100%", maxWidth: "none", margin: "0 auto" }}>
      <Card className="glass-effect" variant={false} style={{ marginBottom: 24, borderRadius: 12 }}>
        <Title level={4} style={{ marginTop: 0, marginBottom: 12 }}>{tr("创建考试")}</Title>
        <Text type="secondary" style={{ display: "block", marginBottom: 18 }}>
          {tr("提交后系统会按照当前学校策略自动分房，并给考场分配监考布局参数。")}
        </Text>
        <Form form={examForm} layout="vertical" onFinish={onSubmitExam}>
          <Space align="start" size="large" wrap>
            <Form.Item name="name" label={tr("考试名称")} rules={[{ required: true, message: tr("请输入考试名称") }]}>
              <Input placeholder={tr("输入考试名称")} style={{ width: 220 }} />
            </Form.Item>
            <Form.Item name="departmentId" label={tr("学院")} rules={[{ required: true, message: tr("请选择学院") }]}>
              <Select
                style={{ width: 180 }}
                placeholder={tr("选择学院")}
                onChange={(value) => loadMajors(value)}
                options={departments.map((item) => ({ value: item.id, label: item.name }))}
              />
            </Form.Item>
            <Form.Item name="majorId" label={tr("专业")} rules={[{ required: true, message: tr("请选择专业") }]}>
              <Select
                style={{ width: 180 }}
                placeholder={tr("选择专业")}
                disabled={!majors.length}
                options={majors.map((item) => ({ value: item.id, label: item.name }))}
              />
            </Form.Item>
          </Space>
          <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
            <Form.Item name="startAt" label={tr("开始时间")} rules={[{ required: true, message: tr("请选择开始时间") }]}>
              <Input key={`create-start-${language}`} type="datetime-local" lang={language} style={{ width: 220 }} />
            </Form.Item>
          <Form.Item name="endAt" label={tr("结束时间")} rules={[{ required: true, message: tr("请选择结束时间") }]}>
              <Input key={`create-end-${language}`} type="datetime-local" lang={language} style={{ width: 220 }} />
            </Form.Item>
          </div>
          <div style={{ marginBottom: 12 }}>
            <Space wrap>
              <Upload beforeUpload={importRoster} maxCount={1} accept=".csv,text/csv" showUploadList={false}>
                <Button icon={<UploadOutlined />}>{tr("导入考试名单 CSV")}</Button>
              </Upload>
              {importedStudentEmails.length > 0 && <Tag color="processing">{tr("已导入")} {importedStudentEmails.length} {tr("人")}</Tag>}
              {importedStudentEmails.length > 0 && (
                <Button onClick={() => setImportedStudentEmails([])}>
                  {tr("清空名单")}
                </Button>
              )}
            </Space>
            <Text type="secondary" style={{ display: "block", marginTop: 8 }}>
              {tr("CSV 第一列为学生邮箱。未导入名单时，默认按学院+专业全量安排考生。")}
            </Text>
          </div>
          <Divider dashed style={{ margin: "12px 0" }} />
          <Space align="start" size="large" wrap>
            <Form.Item name="invigilatorScreenWidth" label={tr("监考屏幕宽(px)")}>
              <InputNumber min={1} style={{ width: 140 }} />
            </Form.Item>
            <Form.Item name="invigilatorScreenHeight" label={tr("监考屏幕高(px)")}>
              <InputNumber min={1} style={{ width: 140 }} />
            </Form.Item>
            <Form.Item name="minStudentTileWidth" label={tr("最小画面宽(px)")}>
              <InputNumber min={1} style={{ width: 140 }} />
            </Form.Item>
            <Form.Item name="minStudentTileHeight" label={tr("最小画面高(px)")}>
              <InputNumber min={1} style={{ width: 140 }} />
            </Form.Item>
            <Form.Item name="hardCapPerRoom" label={tr("单房间硬上限(选填)")}>
              <InputNumber min={1} style={{ width: 140 }} placeholder={tr("无限制")} />
            </Form.Item>
          </Space>
          <div style={{ marginTop: 8 }}>
            <Button
              type="primary"
              htmlType="submit"
              size="large"
              loading={loading}
              disabled={!majors.length}
              icon={<FileAddOutlined />}
            >
              {tr("创建考试并分房")}
            </Button>
            {departmentIdVal && !majors.length && (
              <Text type="danger" style={{ marginLeft: 16 }}>
                {tr("当前学院暂无专业，请先创建专业")}
              </Text>
            )}
          </div>
        </Form>
      </Card>

      {result && (
        <Card className="glass-effect" variant={false} style={{ borderRadius: 12, border: "1px solid #52c41a" }}>
          <Title level={4} style={{ color: "#52c41a", marginTop: 0 }}>{tr("自动分房结果")}</Title>
          <Space split={<Divider type="vertical" />} style={{ marginBottom: 8 }}>
            <Text>{tr("名称")}: <Text strong>{result.examName}</Text></Text>
            <Text>{tr("总人数")}: <Text strong>{result.studentCount}</Text></Text>
            <Text>{tr("考场数")}: <Text strong>{result.roomCount}</Text></Text>
          </Space>
        </Card>
      )}
    </div>
  );
}
