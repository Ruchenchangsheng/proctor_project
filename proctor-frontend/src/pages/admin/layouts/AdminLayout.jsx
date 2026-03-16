import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { Button, Card, Typography } from "antd";
import { useAuthStore } from "../../../store/auth";
import AppSideMenu from "../../../components/AppSideMenu";
import LanguageSwitcher from "../../../components/LanguageSwitcher.jsx";
import useCatalogTranslation from "../../../i18n/useCatalogTranslation.js";

const { Title, Text } = Typography;

const navGroups = [
  {
    key: "monitor",
    label: "平台总览",
    children: [
      { key: "school-overview", label: "全平台学校总览", path: "/admin/school-overview" },
      { key: "exams", label: "跨学校考试总览", path: "/admin/exams" },
      { key: "users", label: "跨学校学生/老师查询", path: "/admin/users" },
      { key: "evidence", label: "全平台作弊证据中心", path: "/admin/evidence" },
    ],
  },
  {
    key: "manage",
    label: "平台管理",
    children: [
      {
        key: "schools",
        label: "学校管理",
        defaultPath: "/admin/schools/list",
        children: [
          { key: "schools-list", label: "学校列表", path: "/admin/schools/list" },
          { key: "schools-add", label: "学校添加", path: "/admin/schools/add" },
        ],
      },
      { key: "school-admins", label: "学校管理员账号管理", path: "/admin/school-admins" },
      { key: "settings", label: "平台参数配置", path: "/admin/settings" },
      { key: "logs", label: "审计日志/操作日志", path: "/admin/audit-logs" },
      { key: "notices", label: "公告通知/邮件模板", path: "/admin/notifications" },
    ],
  },
];

export default function AdminLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const me = useAuthStore((s) => s.me);
  const logout = useAuthStore((s) => s.logout);
  const { tr } = useCatalogTranslation();

  function onLogout() {
    logout();
    navigate("/login", { replace: true });
  }

  const headerMeta = `${tr("姓名")}: ${me?.name || "-"} | ${tr("邮箱")}: ${me?.email || "-"}`;

  return (
    <div className="app-dashboard-layout" style={{ width: "100%", maxWidth: "none", margin: "0 auto" }}>
      <Card className="glass-effect" variant="borderless" style={{ borderRadius: 16 }}>
        <div className="app-shell-header-row">
          <div>
            <Title level={4} style={{ margin: 0 }}>{tr("系统管理员主页")}</Title>
            <Text className="app-shell-header-meta">{headerMeta}</Text>
          </div>
          <div className="app-shell-header-actions">
            <LanguageSwitcher compact />
            <Button danger onClick={onLogout}>{tr("退出登录")}</Button>
          </div>
        </div>
      </Card>

      <div className="app-shell-body">
        <Card className="glass-effect app-side-shell" variant="borderless" style={{ borderRadius: 20, overflowY: "auto" }}>
          <AppSideMenu groups={navGroups} pathname={location.pathname} onNavigate={navigate} />
        </Card>

        <div style={{ minHeight: 0, width: "100%" }}>
          <Outlet />
        </div>
      </div>
    </div>
  );
}
