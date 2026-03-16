import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { Button, Card, Space, Typography } from "antd";
import { useEffect, useState } from "react";
import { api } from "../../../apiClient";
import { useAuthStore } from "../../../store/auth";
import AppSideMenu from "../../../components/AppSideMenu";
import ChangePasswordButton from "../../../components/ChangePasswordButton";
import LanguageSwitcher from "../../../components/LanguageSwitcher.jsx";
import useCatalogTranslation from "../../../i18n/useCatalogTranslation.js";

const { Title, Text } = Typography;

const navGroups = [
  {
    key: "org",
    label: "组织管理",
    children: [
      {
        key: "departments",
        label: "学院管理",
        defaultPath: "/school/departments/list",
        children: [
          { key: "departments-list", label: "学院列表", path: "/school/departments/list" },
          { key: "departments-add", label: "学院添加", path: "/school/departments/add" },
        ],
      },
      {
        key: "majors",
        label: "专业管理",
        defaultPath: "/school/majors/list",
        children: [
          { key: "majors-list", label: "专业列表", path: "/school/majors/list" },
          { key: "majors-add", label: "专业添加", path: "/school/majors/add" },
        ],
      },
      {
        key: "teachers",
        label: "老师管理",
        defaultPath: "/school/teachers/list",
        children: [
          { key: "teachers-list", label: "老师列表", path: "/school/teachers/list" },
          { key: "teachers-add", label: "老师添加", path: "/school/teachers/add" },
        ],
      },
      {
        key: "students",
        label: "学生管理",
        defaultPath: "/school/students/list",
        children: [
          { key: "students-list", label: "学生列表", path: "/school/students/list" },
          { key: "students-add", label: "学生添加", path: "/school/students/add" },
        ],
      },
    ],
  },
  {
    key: "exam",
    label: "考试管理",
    children: [
      { key: "policy", label: "异常检测设置", path: "/school/exam_anomaly_settings" },
      { key: "create", label: "创建考试", path: "/school/exam_create" },
      { key: "overview", label: "考试与考场总览", path: "/school/exam_overview" },
    ],
  },
  {
    key: "evidence",
    label: "证据中心",
    children: [
      { key: "school-evidence", label: "本校证据查看", path: "/school/evidence/exams" },
    ],
  },
];

export default function SchoolLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const me = useAuthStore((s) => s.me);
  const logout = useAuthStore((s) => s.logout);
  const [school, setSchool] = useState(null);
  const { tr } = useCatalogTranslation();

  useEffect(() => {
    (async () => {
      try {
        const r = await api.get("/school/my");
        setSchool(r.data);
      } catch {
        setSchool(null);
      }
    })();
  }, []);

  function onLogout() {
    logout();
    navigate("/login", { replace: true });
  }

  const headerMeta = `${tr("姓名")}: ${me?.name || "-"} | ${tr("学校")}: ${school?.name || "-"} | ${tr("邮箱")}: ${me?.email || "-"}`;

  return (
    <div className="app-dashboard-layout" style={{ width: "100%", maxWidth: "none", margin: "0 auto" }}>
      <Card className="glass-effect" variant="borderless" style={{ borderRadius: 16 }}>
        <div className="app-shell-header-row">
          <div>
            <Title level={4} style={{ margin: 0 }}>{tr("学校管理员主页")}</Title>
            <Text className="app-shell-header-meta">{headerMeta}</Text>
          </div>
          <Space wrap className="app-shell-header-actions">
            <LanguageSwitcher compact />
            <ChangePasswordButton buttonText="修改密码" />
            <Button danger onClick={onLogout}>{tr("退出登录")}</Button>
          </Space>
        </div>
      </Card>

      <div className="app-shell-body">
        <Card className="glass-effect app-side-shell" variant="borderless" style={{ borderRadius: 20, overflowY: "auto" }}>
          <AppSideMenu groups={navGroups} pathname={location.pathname} onNavigate={navigate} />
        </Card>

        <div style={{ minHeight: 0, width: "100%" }}>
          <Outlet context={{ school }} />
        </div>
      </div>
    </div>
  );
}
