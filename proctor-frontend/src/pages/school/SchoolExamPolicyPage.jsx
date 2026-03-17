// SchoolExamPolicyPage 用于维护学校的异常判定策略和监考参数。
import { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { Button, Card, Form, InputNumber, Typography, message } from "antd";
import { SaveOutlined } from "@ant-design/icons";
import { api } from "../../apiClient";
import useCatalogTranslation from "../../i18n/useCatalogTranslation";

const { Title, Text } = Typography;

export default function SchoolExamPolicyPage() {
  const { school } = useOutletContext();
  const { tr } = useCatalogTranslation();
  const [policySaving, setPolicySaving] = useState(false);
  const [policyForm] = Form.useForm();

  // 这个 effect 负责在依赖变化时同步加载数据或建立/释放副作用。
  // 阅读时可以重点看依赖数组、内部异步流程以及 return 清理逻辑三部分。
  useEffect(() => {
    if (!school?.id) return;
    loadAnomalyPolicy();
  }, [school?.id]);

  // 负责读取当前页面所需的数据，并把结果同步到 state 中。
  // 跟读这个函数时，建议同时留意它依赖了哪些 state/ref，以及执行后会触发哪些界面刷新。
  async function loadAnomalyPolicy() {
    try {
      const r = await api.get(`/school/${school.id}/anomaly-policy`);
      if (r.data?.ok && r.data?.policy) {
        policyForm.setFieldsValue(r.data.policy);
      }
    } catch (err) {
      message.error(tr("加载策略失败"));
    }
  }

  // 负责处理当前页面的提交型交互，并在成功后刷新界面状态。
  // 跟读这个函数时，建议同时留意它依赖了哪些 state/ref，以及执行后会触发哪些界面刷新。
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
        message.success(tr("异常检测设置已更新"));
      }
    } catch (err) {
      message.error(err.message || tr("保存失败"));
    } finally {
      setPolicySaving(false);
    }
  }

  return (
    <div style={{ width: "100%", maxWidth: "none", margin: "0 auto" }}>
      <Card className="glass-effect" variant={false} style={{ borderRadius: 12 }}>
        <Title level={4} style={{ marginTop: 0, marginBottom: 20 }}>{tr("异常检测设置")}</Title>
        <Form form={policyForm} layout="inline" onFinish={saveAnomalyPolicy} style={{ rowGap: 12 }}>
          <Form.Item name="warningThreshold" label={tr("普通违规阈值")}>
            <InputNumber min={0} max={1} step={0.01} style={{ width: 110 }} />
          </Form.Item>
          <Form.Item name="severeThreshold" label={tr("严重违规阈值")}>
            <InputNumber min={0} max={1} step={0.01} style={{ width: 110 }} />
          </Form.Item>
          <Form.Item name="sampleIntervalMs" label={tr("采样间隔(ms)")}>
            <InputNumber min={33} max={33} step={33} style={{ width: 130 }} disabled />
          </Form.Item>
          <Form.Item name="identityVerifyIntervalSec" label={tr("身份核验间隔(秒)")}>
            <InputNumber min={2} max={120} step={1} style={{ width: 130 }} />
          </Form.Item>
          <div style={{ width: "100%", display: "flex", justifyContent: "flex-end", marginTop: 20 }}>
            <Button type="primary" htmlType="submit" loading={policySaving} icon={<SaveOutlined />}>
              {tr("保存设置")}
            </Button>
          </div>
        </Form>
        <Text type="secondary" style={{ display: "block", marginTop: 16, fontSize: 13 }}>
          {tr("模型输出的违规概率大于等于严重阈值时，将被判定为严重违规，否则为普通违规。")}
        </Text>
        <Text type="secondary" style={{ display: "block", marginTop: 12, fontSize: 13 }}>
          {tr("当前行为模型按 30fps 训练，采样间隔已固定为 33ms，用于严格对齐模型输入时序。")}
        </Text>
      </Card>
    </div>
  );
}
