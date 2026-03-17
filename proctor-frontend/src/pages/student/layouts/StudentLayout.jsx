// StudentLayout 负责学生端页面壳层与路由出口，保证考试流转时的统一布局。
import { Outlet, useNavigate } from "react-router-dom";
import { Button, Layout, Space } from "antd";
import LanguageSwitcher from "../../../components/LanguageSwitcher.jsx";
import { useAuthStore } from "../../../store/auth";
import useCatalogTranslation from "../../../i18n/useCatalogTranslation.js";

const { Content } = Layout;

export default function StudentLayout() {
  const navigate = useNavigate();
  const logout = useAuthStore((s) => s.logout);
  const { tr } = useCatalogTranslation();

  // 负责把页面中的一段独立交互逻辑拆出来，避免主组件渲染区混入过多细节。
  // 跟读这个函数时，建议同时留意它依赖了哪些 state/ref，以及执行后会触发哪些界面刷新。
  function onLogout() {
    logout();
    navigate("/login", { replace: true });
  }

  return (
    <Layout className="app-student-layout">
      <Content className="app-student-content">
        <Space wrap className="app-student-toolbar">
          <LanguageSwitcher compact />
          <Button danger onClick={onLogout}>{tr("退出登录")}</Button>
        </Space>
        <Outlet />
      </Content>
    </Layout>
  );
}
