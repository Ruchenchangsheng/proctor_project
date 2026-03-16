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
        key: "tasks",
        label: "监考任务",
        children: [
            { key: "all", label: "全部考试", path: "/teacher/tasks/all" },
            { key: "pending", label: "待考试", path: "/teacher/tasks/pending" },
            { key: "running", label: "考试中", path: "/teacher/tasks/running" },
            { key: "completed", label: "已完成", path: "/teacher/tasks/completed" },
        ],
    },
    {
        key: "evidence",
        label: "作弊证据",
        children: [{ key: "exam-list", label: "已完成考试", path: "/teacher/evidence/exams" }],
    },
];

export default function TeacherLayout() {
    const location = useLocation();
    const navigate = useNavigate();
    const logout = useAuthStore((s) => s.logout);
    const [profile, setProfile] = useState(null);
    const { tr } = useCatalogTranslation();

    useEffect(() => {
        api.get("/teacher/profile").then((r) => setProfile(r.data)).catch(() => setProfile(null));
    }, []);

    const headerMeta = `${tr("姓名")}: ${profile?.name || "-"} | ${tr("学校")}: ${profile?.schoolName || "-"} | ${tr("学院")}: ${profile?.departmentName || "-"}`;

    return (
        <div className="app-dashboard-layout" style={{ width: "100%", maxWidth: "none", margin: "0 auto" }}>
            <Card className="glass-effect" variant="borderless" style={{ borderRadius: 16 }}>
                <div className="app-shell-header-row">
                    <div>
                        <Title level={4} style={{ margin: 0 }}>{tr("监考老师主页")}</Title>
                        <Text className="app-shell-header-meta">{headerMeta}</Text>
                    </div>
                    <Space wrap className="app-shell-header-actions">
                        <LanguageSwitcher compact />
                        <ChangePasswordButton buttonText="修改密码" />
                        <Button danger onClick={() => { logout(); navigate('/login', { replace: true }); }}>{tr("退出登录")}</Button>
                    </Space>
                </div>
            </Card>

            <div className="app-shell-body">
                <Card className="glass-effect app-side-shell" variant="borderless" style={{ borderRadius: 20, overflowY: "auto" }}>
                    <AppSideMenu groups={navGroups} pathname={location.pathname} onNavigate={navigate} />
                </Card>

                <div style={{ minHeight: 0 }}>
                    <Outlet />
                </div>
            </div>
        </div>
    );
}
