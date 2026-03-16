import React, { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { api } from "../../apiClient";
import { Table, Card, Form, Input, Select, Button, Typography, Space, Tag, Upload, message, Modal, Popconfirm } from "antd";
import { UserAddOutlined, ReloadOutlined, UploadOutlined, EditOutlined, DeleteOutlined, SearchOutlined } from "@ant-design/icons";
import { opaqueWhiteModalProps } from "./modalStyles";
import useCatalogTranslation from "../../i18n/useCatalogTranslation";

const { Title, Text } = Typography;

export default function SchoolStudentsPages({ mode = "list" }) {
  const { school } = useOutletContext();
  const { tr } = useCatalogTranslation();
  const [departments, setDepartments] = useState([]);
  const [createMajors, setCreateMajors] = useState([]);
  const [filterMajors, setFilterMajors] = useState([]);
  const [editMajors, setEditMajors] = useState([]);
  const [filterDeptId, setFilterDeptId] = useState(null);
  const [filterMajorId, setFilterMajorId] = useState(null);
  const [keyword, setKeyword] = useState("");
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState(null);
  const [editPhotoList, setEditPhotoList] = useState([]);
  const [form] = Form.useForm();
  const [editForm] = Form.useForm();
  const showAdd = mode === "add";
  const showList = mode === "list";

  useEffect(() => {
    if (!school?.id) return;
    loadDepartments();
  }, [school?.id]);

  async function loadDepartments() {
    try {
      const d = await api.get(`/school/${school.id}/departments`);
      const deptList = d.data || [];
      setDepartments(deptList);
      const firstDeptId = deptList[0]?.id || null;
      setFilterDeptId(firstDeptId);
      form.setFieldsValue({ departmentId: firstDeptId });
      if (firstDeptId) {
        const majors = await fetchMajors(firstDeptId);
        setCreateMajors(majors);
        setFilterMajors(majors);
        const firstMajorId = majors[0]?.id || null;
        form.setFieldsValue({ majorId: firstMajorId });
        setFilterMajorId(firstMajorId);
        if (showList) {
          await loadList(firstDeptId, firstMajorId, "");
        }
      } else {
        setCreateMajors([]);
        setFilterMajors([]);
        setList([]);
      }
    } catch (e) {
      message.error(tr("加载学院失败"));
    }
  }

  async function fetchMajors(departmentId) {
    if (!departmentId) return [];
    const r = await api.get(`/school/${school.id}/majors`, { params: { departmentId } });
    return r.data || [];
  }

  async function loadList(departmentId = filterDeptId, majorId = filterMajorId, nextKeyword = keyword) {
    setLoading(true);
    try {
      const r = await api.get(`/school/${school.id}/students`, {
        params: {
          departmentId: departmentId || undefined,
          majorId: majorId || undefined,
          keyword: nextKeyword || undefined,
        },
      });
      setList(r.data || []);
    } catch (e) {
      message.error("加载学生失败");
    } finally {
      setLoading(false);
    }
  }

  async function onCreateDeptChange(value) {
    const majors = await fetchMajors(value);
    setCreateMajors(majors);
    form.setFieldsValue({ majorId: majors[0]?.id || null });
  }

  async function onFilterDeptChange(value) {
    setFilterDeptId(value);
    const majors = await fetchMajors(value);
    setFilterMajors(majors);
    const firstMajorId = majors[0]?.id || null;
    setFilterMajorId(firstMajorId);
    await loadList(value, firstMajorId, keyword);
  }

  async function onFilterMajorChange(value) {
    setFilterMajorId(value);
    await loadList(filterDeptId, value, keyword);
  }

  async function onFinish(values) {
    const photoFile = values.photo?.fileList?.[0]?.originFileObj;
    if (!values.majorId) {
      message.error(tr("请先为该学院添加专业"));
      return;
    }
    if (!photoFile) {
      message.error(tr("请上传证件照"));
      return;
    }

    setSubmitLoading(true);
    const fd = new FormData();
    fd.append("name", values.name?.trim());
    fd.append("email", values.email?.trim());
    fd.append("departmentId", values.departmentId);
    fd.append("majorId", values.majorId);
    fd.append("photo", photoFile);

    try {
      await api.post(`/school/${school.id}/students`, fd);
      form.resetFields(["name", "email", "photo"]);
      message.success(tr("已创建学生账号并发送初始密码（已提取人脸特征）"));
      await loadList(filterDeptId, filterMajorId, keyword);
    } catch (e) {
      message.error(e.message || tr("创建失败"));
    } finally {
      setSubmitLoading(false);
    }
  }

  async function importStudents(file) {
    const fd = new FormData();
    fd.append("archive", file);
    try {
      const r = await api.post(`/school/${school.id}/students/import`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      const failureCount = Number(r.data?.failureCount || 0);
      if (failureCount > 0) {
        Modal.warning({
          title: tr("批量导入完成"),
          content: (
            <div>
              <div>{tr("成功")}: {r.data?.successCount || 0}</div>
              <div>{tr("失败")}: {failureCount}</div>
              <div style={{ marginTop: 8, whiteSpace: "pre-wrap" }}>
                {(r.data?.failures || []).map((item) => tr(`第 ${item.rowNum} 行：${item.message}`)).join("\n")}
              </div>
            </div>
          ),
          ...opaqueWhiteModalProps,
        });
      } else {
        message.success(tr(`批量导入完成，共新增 ${r.data?.successCount || 0} 位学生`));
      }
      await loadList(filterDeptId, filterMajorId, keyword);
    } catch (e) {
      message.error(e.message || tr("批量导入失败"));
    }
    return false;
  }

  async function openEdit(record) {
    const department = departments.find((item) => item.name === record.departmentName);
    const departmentId = department?.id || null;
    const majors = departmentId ? await fetchMajors(departmentId) : [];
    const major = majors.find((item) => item.name === record.majorName);
    setEditingStudent(record);
    setEditMajors(majors);
    setEditPhotoList([]);
    editForm.setFieldsValue({
      name: record.name,
      email: record.email,
      departmentId,
      majorId: major?.id || null,
    });
    setEditOpen(true);
  }

  async function onEditDeptChange(value) {
    const majors = await fetchMajors(value);
    setEditMajors(majors);
    editForm.setFieldsValue({ majorId: majors[0]?.id || null });
  }

  async function submitEdit(values) {
    if (!editingStudent?.id) return;
    setSubmitLoading(true);
    const fd = new FormData();
    fd.append("name", values.name?.trim());
    fd.append("email", values.email?.trim());
    fd.append("departmentId", values.departmentId);
    fd.append("majorId", values.majorId);
    const photoFile = editPhotoList[0]?.originFileObj;
    if (photoFile) {
      fd.append("photo", photoFile);
    }

    try {
      await api.put(`/school/${school.id}/students/${editingStudent.id}`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setEditOpen(false);
      setEditingStudent(null);
      setEditPhotoList([]);
      await loadList(filterDeptId, filterMajorId, keyword);
      message.success(tr("学生信息已更新"));
    } catch (e) {
      message.error(e.message || tr("更新失败"));
    } finally {
      setSubmitLoading(false);
    }
  }

  async function removeStudent(record) {
    try {
      await api.delete(`/school/${school.id}/students/${record.id}`);
      await loadList(filterDeptId, filterMajorId, keyword);
      message.success(tr("学生已删除"));
    } catch (e) {
      message.error(e.message || tr("删除失败"));
    }
  }

  async function toggleEnabled(record, nextEnabled) {
    try {
      await api.post(`/school/${school.id}/students/${record.id}/toggle-enabled`, { enabled: nextEnabled });
      await loadList(filterDeptId, filterMajorId, keyword);
      message.success(nextEnabled ? tr("学生账号已启用") : tr("学生账号已冻结"));
    } catch (e) {
      message.error(e.message || tr("操作失败"));
    }
  }

  async function resetPassword(record) {
    try {
      const r = await api.post(`/school/${school.id}/students/${record.id}/reset-password`);
      Modal.success({
        title: tr("密码已重置"),
        content: (
          <div>
            <div>{tr("临时密码")}: <strong>{r.data?.tempPassword}</strong></div>
            <div>{tr("邮件发送")}: {r.data?.mailSent ? tr("成功") : tr("失败，请手动通知")}</div>
          </div>
        ),
        ...opaqueWhiteModalProps,
      });
    } catch (e) {
      message.error(e.message || tr("重置密码失败"));
    }
  }

  const columns = [
    { title: tr("姓名"), dataIndex: "name", key: "name", width: 120, ellipsis: true },
    { title: tr("邮箱"), dataIndex: "email", key: "email", width: 220, ellipsis: true },
    { title: tr("学院"), dataIndex: "departmentName", key: "departmentName", width: 130, ellipsis: true, render: (text) => text || "-" },
    { title: tr("专业"), dataIndex: "majorName", key: "majorName", width: 130, ellipsis: true, render: (text) => text || "-" },
    { title: tr("创建时间"), dataIndex: "createdAt", key: "createdAt", width: 170, render: (text) => text || "-" },
    {
      title: tr("状态"),
      dataIndex: "enabled",
      key: "enabled",
      width: 100,
      render: (value) => <Tag color={Number(value) === 1 ? "success" : "default"}>{Number(value) === 1 ? tr("已启用") : tr("已冻结")}</Tag>,
    },
    {
      title: tr("操作"),
      key: "action",
      width: 380,
      render: (_, record) => (
        <Space wrap size={4}>
          <Button type="link" icon={<EditOutlined />} onClick={() => openEdit(record)}>{tr("修改")}</Button>
          <Button type="link" onClick={() => resetPassword(record)}>{tr("重置密码")}</Button>
          <Popconfirm
            title={Number(record.enabled) === 1 ? tr("确定冻结该学生账号吗？") : tr("确定启用该学生账号吗？")}
            onConfirm={() => toggleEnabled(record, Number(record.enabled) !== 1)}
            okText={tr("确认")}
            cancelText={tr("取消")}
          >
            <Button type="link" danger={Number(record.enabled) === 1}>
              {Number(record.enabled) === 1 ? tr("冻结账号") : tr("启用账号")}
            </Button>
          </Popconfirm>
          <Popconfirm
            title={tr("确定删除该学生吗？")}
            description={tr("如果学生仍有关联的未结束考试，将无法删除。")}
            onConfirm={() => removeStudent(record)}
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
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
            <Title level={4} style={{ margin: 0 }}>{tr("添加考生（含证件照）")}</Title>
            <Upload beforeUpload={importStudents} maxCount={1} accept=".zip,application/zip" showUploadList={false}>
              <Button icon={<UploadOutlined />}>{tr("批量导入学生 ZIP")}</Button>
            </Upload>
          </div>
          <Text type="secondary" style={{ display: "block", marginBottom: 16 }}>
            {tr("ZIP 内需包含 `students.csv` 和对应照片文件，CSV 列：`name,email,department,major,photoFile`。")}
          </Text>
          <Form form={form} layout="inline" onFinish={onFinish} style={{ gap: "12px 0" }}>
            <Form.Item name="name" rules={[{ required: true, message: tr("请输入学生姓名") }]}>
              <Input placeholder={tr("姓名")} />
            </Form.Item>
            <Form.Item name="email" rules={[{ required: true, message: tr("请输入邮箱") }, { type: "email", message: tr("邮箱格式错误") }]}>
              <Input placeholder={tr("邮箱")} />
            </Form.Item>
            <Form.Item name="departmentId" rules={[{ required: true, message: tr("请选择学院") }]}>
              <Select style={{ width: 160 }} placeholder={tr("学院")} onChange={onCreateDeptChange} options={departments.map((item) => ({ value: item.id, label: item.name }))} />
            </Form.Item>
            <Form.Item name="majorId" rules={[{ required: true, message: tr("请选择专业") }]}>
              <Select style={{ width: 160 }} placeholder={tr("专业")} disabled={!createMajors.length} options={createMajors.map((item) => ({ value: item.id, label: item.name }))} />
            </Form.Item>
            <Form.Item name="photo" rules={[{ required: true, message: tr("请上传证件照") }]}>
              <Upload beforeUpload={() => false} maxCount={1} accept="image/*">
                <Button icon={<UploadOutlined />}>{tr("选择证件照")}</Button>
              </Upload>
            </Form.Item>
            <Form.Item>
              <Button type="primary" htmlType="submit" disabled={!createMajors.length} loading={submitLoading} icon={<UserAddOutlined />}>{tr("创建学生账号")}</Button>
            </Form.Item>
          </Form>
        </Card>
      )}

      {showList && (
        <Card className="glass-effect" variant={false} style={{ borderRadius: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, gap: 12, flexWrap: "wrap" }}>
            <Title level={4} style={{ margin: 0 }}>{tr("学生列表")}</Title>
            <Space wrap>
              <Select value={filterDeptId} style={{ width: 150 }} onChange={onFilterDeptChange} options={departments.map((item) => ({ value: item.id, label: item.name }))} />
              <Select value={filterMajorId} style={{ width: 150 }} onChange={onFilterMajorChange} disabled={!filterMajors.length} options={filterMajors.map((item) => ({ value: item.id, label: item.name }))} />
              <Input
                allowClear
                value={keyword}
                placeholder={tr("输入学生姓名或邮箱")}
                style={{ width: 220 }}
                onChange={(e) => setKeyword(e.target.value)}
                onPressEnter={() => loadList(filterDeptId, filterMajorId, keyword)}
              />
              <Button icon={<SearchOutlined />} onClick={() => loadList(filterDeptId, filterMajorId, keyword)}>{tr("查询")}</Button>
              <Button
                icon={<ReloadOutlined />}
                onClick={() => {
                  setKeyword("");
                  loadList(filterDeptId, filterMajorId, "");
                }}
              >
                {tr("重置")}
              </Button>
            </Space>
          </div>
          <Table columns={columns} dataSource={list} rowKey="id" loading={loading} pagination={{ pageSize: 10 }} scroll={{ x: 1250 }} style={{ background: "transparent" }} />
        </Card>
      )}

      {showList && (
        <Modal
          title={tr("修改学生信息")}
          open={editOpen}
          onCancel={() => {
            setEditOpen(false);
            setEditingStudent(null);
            setEditMajors([]);
            setEditPhotoList([]);
            editForm.resetFields();
          }}
          onOk={() => editForm.submit()}
          confirmLoading={submitLoading}
          okText={tr("保存")}
          cancelText={tr("取消")}
          {...opaqueWhiteModalProps}
        >
          <Form form={editForm} layout="vertical" onFinish={submitEdit}>
            <Form.Item name="name" label={tr("姓名")} rules={[{ required: true, message: tr("请输入学生姓名") }]}>
              <Input placeholder={tr("输入学生姓名")} />
            </Form.Item>
            <Form.Item name="email" label={tr("邮箱")} rules={[{ required: true, message: tr("请输入邮箱") }, { type: "email", message: tr("邮箱格式错误") }]}>
              <Input placeholder={tr("输入邮箱")} />
            </Form.Item>
            <Form.Item name="departmentId" label={tr("学院")} rules={[{ required: true, message: tr("请选择学院") }]}>
              <Select onChange={onEditDeptChange} options={departments.map((item) => ({ value: item.id, label: item.name }))} />
            </Form.Item>
            <Form.Item name="majorId" label={tr("专业")} rules={[{ required: true, message: tr("请选择专业") }]}>
              <Select disabled={!editMajors.length} options={editMajors.map((item) => ({ value: item.id, label: item.name }))} />
            </Form.Item>
            <Form.Item label={tr("重新上传证件照（选填）")}>
              <Upload
                beforeUpload={() => false}
                maxCount={1}
                accept="image/*"
                fileList={editPhotoList}
                onChange={({ fileList }) => setEditPhotoList(fileList)}
              >
                <Button icon={<UploadOutlined />}>{tr("选择证件照")}</Button>
              </Upload>
              <Text type="secondary" style={{ display: "block", marginTop: 8 }}>
                {tr("不上传则保留当前人脸信息。")}
              </Text>
            </Form.Item>
          </Form>
        </Modal>
      )}
    </div>
  );
}
