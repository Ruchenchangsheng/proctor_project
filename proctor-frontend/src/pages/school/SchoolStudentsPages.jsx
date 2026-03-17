// SchoolStudentsPages 负责学校学生档案的维护、导入和查询。
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
  // 这里同时维护“新增表单”“筛选表单”“编辑弹窗”三套状态，所以 majors 被拆成 create/filter/edit 三份。
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

  // 这个 effect 负责在依赖变化时同步加载数据或建立/释放副作用。
  // 阅读时可以重点看依赖数组、内部异步流程以及 return 清理逻辑三部分。
  useEffect(() => {
    if (!school?.id) return;
    loadDepartments();
  }, [school?.id]);

  // 负责读取当前页面所需的数据，并把结果同步到 state 中。
  // 跟读这个函数时，建议同时留意它依赖了哪些 state/ref，以及执行后会触发哪些界面刷新。
  async function loadDepartments() {
    try {
      // 初次进入页面时，先拉院系列表，再自动联动出默认专业和默认学生列表，减少用户第一次操作次数。
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

  // 负责读取当前页面所需的数据，并把结果同步到 state 中。
  // 跟读这个函数时，建议同时留意它依赖了哪些 state/ref，以及执行后会触发哪些界面刷新。
  async function fetchMajors(departmentId) {
    if (!departmentId) return [];
    const r = await api.get(`/school/${school.id}/majors`, { params: { departmentId } });
    return r.data || [];
  }

  // 负责读取当前页面所需的数据，并把结果同步到 state 中。
  // 跟读这个函数时，建议同时留意它依赖了哪些 state/ref，以及执行后会触发哪些界面刷新。
  async function loadList(departmentId = filterDeptId, majorId = filterMajorId, nextKeyword = keyword) {
    setLoading(true);
    try {
      // 列表查询只把真正填写过的筛选项传给后端，避免用空字符串污染接口条件判断。
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

  // 负责把页面中的一段独立交互逻辑拆出来，避免主组件渲染区混入过多细节。
  // 跟读这个函数时，建议同时留意它依赖了哪些 state/ref，以及执行后会触发哪些界面刷新。
  async function onCreateDeptChange(value) {
    const majors = await fetchMajors(value);
    setCreateMajors(majors);
    form.setFieldsValue({ majorId: majors[0]?.id || null });
  }

  // 负责把页面中的一段独立交互逻辑拆出来，避免主组件渲染区混入过多细节。
  // 跟读这个函数时，建议同时留意它依赖了哪些 state/ref，以及执行后会触发哪些界面刷新。
  async function onFilterDeptChange(value) {
    setFilterDeptId(value);
    const majors = await fetchMajors(value);
    setFilterMajors(majors);
    const firstMajorId = majors[0]?.id || null;
    setFilterMajorId(firstMajorId);
    await loadList(value, firstMajorId, keyword);
  }

  // 负责把页面中的一段独立交互逻辑拆出来，避免主组件渲染区混入过多细节。
  // 跟读这个函数时，建议同时留意它依赖了哪些 state/ref，以及执行后会触发哪些界面刷新。
  async function onFilterMajorChange(value) {
    setFilterMajorId(value);
    await loadList(filterDeptId, value, keyword);
  }

  // 负责处理当前页面的提交型交互，并在成功后刷新界面状态。
  // 跟读这个函数时，建议同时留意它依赖了哪些 state/ref，以及执行后会触发哪些界面刷新。
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
    // 新增学生时必须把证件照一起上传，因为后端会在创建账号时同步提取人脸特征。
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

  // 负责处理当前页面的提交型交互，并在成功后刷新界面状态。
  // 跟读这个函数时，建议同时留意它依赖了哪些 state/ref，以及执行后会触发哪些界面刷新。
  async function importStudents(file) {
    const fd = new FormData();
    fd.append("archive", file);
    try {
      // 批量导入允许“部分成功、部分失败”，所以结果用 successCount/failureCount 明确反馈给管理员。
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

  // 负责处理当前页面的提交型交互，并在成功后刷新界面状态。
  // 跟读这个函数时，建议同时留意它依赖了哪些 state/ref，以及执行后会触发哪些界面刷新。
  async function openEdit(record) {
    // 编辑弹窗打开前，要先把“当前学生所在院系对应的专业列表”准备好，否则专业下拉框无法正确回填。
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

  // 负责把页面中的一段独立交互逻辑拆出来，避免主组件渲染区混入过多细节。
  // 跟读这个函数时，建议同时留意它依赖了哪些 state/ref，以及执行后会触发哪些界面刷新。
  async function onEditDeptChange(value) {
    const majors = await fetchMajors(value);
    setEditMajors(majors);
    editForm.setFieldsValue({ majorId: majors[0]?.id || null });
  }

  // 负责处理当前页面的提交型交互，并在成功后刷新界面状态。
  // 跟读这个函数时，建议同时留意它依赖了哪些 state/ref，以及执行后会触发哪些界面刷新。
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

  // 负责切换界面状态或执行带副作用的收尾动作。
  // 跟读这个函数时，建议同时留意它依赖了哪些 state/ref，以及执行后会触发哪些界面刷新。
  async function removeStudent(record) {
    try {
      await api.delete(`/school/${school.id}/students/${record.id}`);
      await loadList(filterDeptId, filterMajorId, keyword);
      message.success(tr("学生已删除"));
    } catch (e) {
      message.error(e.message || tr("删除失败"));
    }
  }

  // 负责切换界面状态或执行带副作用的收尾动作。
  // 跟读这个函数时，建议同时留意它依赖了哪些 state/ref，以及执行后会触发哪些界面刷新。
  async function toggleEnabled(record, nextEnabled) {
    try {
      await api.post(`/school/${school.id}/students/${record.id}/toggle-enabled`, { enabled: nextEnabled });
      await loadList(filterDeptId, filterMajorId, keyword);
      message.success(nextEnabled ? tr("学生账号已启用") : tr("学生账号已冻结"));
    } catch (e) {
      message.error(e.message || tr("操作失败"));
    }
  }

  // 负责处理当前页面的提交型交互，并在成功后刷新界面状态。
  // 跟读这个函数时，建议同时留意它依赖了哪些 state/ref，以及执行后会触发哪些界面刷新。
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

  // 表格列配置集中描述了当前页面最核心的展示字段和每列的交互行为。
  // 如果你想理解页面允许用户做什么，优先看这里的 render、按钮和状态标签。
  // 表格列配置集中描述了当前页面最核心的展示字段和每列的交互行为。
  // 如果你想理解页面允许用户做什么，优先看这里的 render、按钮和状态标签。
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
