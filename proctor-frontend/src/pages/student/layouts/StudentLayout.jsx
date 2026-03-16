import { Outlet } from "react-router-dom";
import { Layout } from "antd";
import LanguageSwitcher from "../../../components/LanguageSwitcher.jsx";

const { Content } = Layout;

export default function StudentLayout() {
  return (
    <Layout style={{ minHeight: '100vh', background: 'transparent' }}>
      <Content style={{ padding: '24px', maxWidth: 1200, margin: '0 auto', width: '100%' }}>
        <div className="app-student-toolbar">
          <LanguageSwitcher compact />
        </div>
        <Outlet />
      </Content>
    </Layout>
  );
}
