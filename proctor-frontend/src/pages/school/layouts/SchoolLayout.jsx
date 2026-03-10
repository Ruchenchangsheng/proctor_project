import { useEffect, useState } from "react";
import { Outlet, useNavigate, useLocation } from "react-router-dom";
import { api } from "../../../apiClient";
import { useAuthStore } from "../../../store/auth";
import { Layout, Menu, Button, Space, Typography, Tag } from "antd";
import { LogoutOutlined, BankOutlined, BookOutlined, UsergroupAddOutlined, TeamOutlined, FileTextOutlined } from "@ant-design/icons";

const { Header, Content } = Layout;
const { Text } = Typography;

export default function SchoolLayout() {
  const [school, setSchool] = useState(null);
  const me = useAuthStore((s) => s.me);
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    (async () => {
      try {
        const r = await api.get("/school/my");
        setSchool(r.data);
      } catch (e) {
        console.error(e);
      }
    })();
  }, []);

  function onLogout() {
    logout();
    navigate("/login", { replace: true });
  }

  // 映射当前的路由以高亮导航栏
  const currentKey = location.pathname.split("/").pop();

  const menuItems = [
    { key: "school_departments_pages", icon: <BankOutlined />, label: "学院管理" },
    { key: "school_majors_pages", icon: <BookOutlined />, label: "专业管理" },
    { key: "school_teachers_pages", icon: <TeamOutlined />, label: "老师管理" },
    { key: "school_students_pages", icon: <UsergroupAddOutlined />, label: "学生管理" },
    { key: "school_exams_pages", icon: <FileTextOutlined />, label: "考试管理" },
  ];

  return (
    <Layout style={{ minHeight: '100%', background: 'transparent' }}>
      <Header 
        className="glass-effect" 
        style={{ 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'space-between',
          padding: '0 24px',
          borderRadius: '12px',
          marginBottom: '20px',
          height: '64px',
          lineHeight: '64px'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
          <div style={{ fontSize: '18px', fontWeight: 'bold', marginRight: '40px', color: '#333' }}>
            🏫 学校后台
          </div>
          <Menu 
            mode="horizontal" 
            selectedKeys={[currentKey]} 
            onClick={(e) => navigate(e.key)}
            items={menuItems}
            style={{ background: 'transparent', borderBottom: 'none', flex: 1, minWidth: 0, fontWeight: 500 }}
          />
        </div>

        <Space size="middle">
          <Tag color="blue" bordered={false} style={{ fontSize: 14, padding: '4px 8px' }}>
            {school?.name || "加载中..."}
          </Tag>
          <Text type="secondary" style={{ display: { xs: 'none', sm: 'inline-block' } }}>
            {me?.email || "--"}
          </Text>
          <Button type="primary" danger icon={<LogoutOutlined />} onClick={onLogout} shape="round">
            退出
          </Button>
        </Space>
      </Header>

      <Content>
        {/* 这里渲染子路由，把 school 数据传下去 */}
        <Outlet context={{ school }} />
      </Content>
    </Layout>
  );
}