import { useEffect, useMemo, useState } from "react";
import { api } from "../../apiClient";
import { Button, Card, Input, Modal, Popconfirm, Select, Space, Table, Tag, Typography, message } from "antd";
import { ReloadOutlined, SearchOutlined } from "@ant-design/icons";
import useCatalogTranslation from "../../i18n/useCatalogTranslation";

const { Title, Text } = Typography;

const roleLabelMap = {
  TEACHER: "老师",
  STUDENT: "学生",
};

export default function AdminUsersPage() {
  const { tr } = useCatalogTranslation();
  const [schools, setSchools] = useState([]);
  const [filters, setFilters] = useState({ role: undefined, schoolId: undefined, enabled: undefined, keyword: "" });
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    initialize();
  }, []);

  async function initialize() {
    try {
      const schoolResp = await api.get("/admin/schools");
      setSchools(schoolResp.data || []);
      await load();
    } catch (e) {
      message.error(e.message || "初始化跨校师生查询失败");
    }
  }

  async function load(nextFilters = filters) {
    setLoading(true);
    try {
      const r = await api.get("/admin/users", {
        params: {
          role: nextFilters.role,
          schoolId: nextFilters.schoolId,
          enabled: nextFilters.enabled,
          keyword: nextFilters.keyword || undefined,
        },
      });
      setList(r.data || []);
    } catch (e) {
      message.error(e.message || "加载师生列表失败");
    } finally {
      setLoading(false);
    }
  }

  const schoolOptions = useMemo(
    () => (schools || []).map((item) => ({ value: item.id, label: item.name })),
    [schools],
  );

  async function toggleEnabled(record, nextEnabled) {
    try {
      await api.post(`/admin/users/${record.id}/toggle-enabled`, { enabled: nextEnabled });
      message.success(nextEnabled ? "账号已启用" : "账号已冻结");
      await load();
    } catch (e) {
      message.error(e.message || "操作失败");
    }
  }

  async function resetPassword(record) {
    try {
      const r = await api.post(`/admin/users/${record.id}/reset-password`);
      Modal.success({
        title: tr(`${roleLabelMap[record.role] || "用户"}密码已重置`),
        content: (
          <div>
            <div>{tr("临时密码")}：<strong>{r.data?.tempPassword}</strong></div>
            <div>{tr("邮件发送")}：{r.data?.mailSent ? tr("成功") : tr("失败，请手动通知")}</div>
          </div>
        ),
      });
    } catch (e) {
      message.error(e.message || "重置密码失败");
    }
  }

  return (
    <Card className="glass-effect" variant={false} style={{ borderRadius: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
        <div>
          <Title level={4} style={{ margin: 0 }}>{tr("跨学校学生/老师查询")}</Title>
          <Text type="secondary">{tr("平台管理员可按学校、身份、姓名或邮箱检索并进行账号管控")}</Text>
        </div>
        <Space wrap>
          <Select
            allowClear
            value={filters.role}
            placeholder={tr("用户类型")}
            style={{ width: 140 }}
            options={[
              { value: "TEACHER", label: tr("老师") },
              { value: "STUDENT", label: tr("学生") },
            ]}
            onChange={(value) => setFilters((prev) => ({ ...prev, role: value }))}
          />
          <Select
            allowClear
            value={filters.schoolId}
            placeholder={tr("学校")}
            style={{ width: 180 }}
            options={schoolOptions}
            onChange={(value) => setFilters((prev) => ({ ...prev, schoolId: value }))}
          />
          <Select
            allowClear
            value={filters.enabled}
            placeholder={tr("账号状态")}
            style={{ width: 140 }}
            options={[
              { value: 1, label: tr("已启用") },
              { value: 0, label: tr("已冻结") },
            ]}
            onChange={(value) => setFilters((prev) => ({ ...prev, enabled: value }))}
          />
          <Input
            allowClear
            prefix={<SearchOutlined />}
            value={filters.keyword}
            placeholder={tr("输入姓名或邮箱")}
            style={{ width: 240 }}
            onChange={(e) => setFilters((prev) => ({ ...prev, keyword: e.target.value }))}
            onPressEnter={() => load()}
          />
          <Button icon={<SearchOutlined />} onClick={() => load()}>{tr("查询")}</Button>
          <Button
            icon={<ReloadOutlined />}
            onClick={() => {
              const next = { role: undefined, schoolId: undefined, enabled: undefined, keyword: "" };
              setFilters(next);
              load(next);
            }}
          >
            {tr("重置")}
          </Button>
        </Space>
      </div>

      <Table
        rowKey="id"
        loading={loading}
        dataSource={list}
        pagination={{ pageSize: 10 }}
        scroll={{ x: 1460 }}
        columns={[
          { title: tr("学校"), dataIndex: "schoolName", width: 160 },
          { title: tr("身份"), dataIndex: "role", width: 90, render: (value) => tr(roleLabelMap[value] || value) },
          { title: tr("姓名"), dataIndex: "name", width: 140 },
          { title: tr("邮箱"), dataIndex: "email", width: 220 },
          { title: tr("学院"), dataIndex: "departmentName", width: 130, render: (text) => text || "-" },
          { title: tr("专业"), dataIndex: "majorName", width: 130, render: (text) => text || "-" },
          { title: tr("创建时间"), dataIndex: "createdAt", width: 180 },
          {
            title: tr("状态"),
            dataIndex: "enabled",
            width: 100,
            render: (value) => <Tag color={Number(value) === 1 ? "success" : "default"}>{Number(value) === 1 ? tr("已启用") : tr("已冻结")}</Tag>,
          },
          {
            title: tr("操作"),
            key: "action",
            width: 220,
            render: (_, record) => (
              <Space size={4} wrap>
                <Button type="link" onClick={() => resetPassword(record)}>{tr("重置密码")}</Button>
                <Popconfirm
                  title={Number(record.enabled) === 1 ? tr("确认冻结该账号吗？") : tr("确认启用该账号吗？")}
                  onConfirm={() => toggleEnabled(record, Number(record.enabled) !== 1)}
                  okText={tr("确认")}
                  cancelText={tr("取消")}
                >
                  <Button type="link" danger={Number(record.enabled) === 1}>
                    {Number(record.enabled) === 1 ? tr("冻结账号") : tr("启用账号")}
                  </Button>
                </Popconfirm>
              </Space>
            ),
          },
        ]}
      />
    </Card>
  );
}
