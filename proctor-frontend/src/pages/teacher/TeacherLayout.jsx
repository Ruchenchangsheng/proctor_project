import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { Button, Card, Typography } from "antd";
import { useEffect, useState } from "react";
import { api } from "../../apiClient";
import { useAuthStore } from "../../store/auth";

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

  useEffect(() => {
    api.get("/teacher/profile").then((r) => setProfile(r.data)).catch(() => setProfile(null));
  }, []);

  return (
    <div style={{ maxWidth: 1300, margin: "0 auto", display: "grid", gap: 12, height: "calc(94vh - 8px)" }}>
      <Card className="glass-effect" variant="borderless" style={{ borderRadius: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <div>
            <Title level={4} style={{ margin: 0 }}>监考老师主页</Title>
            <Text>姓名：{profile?.name || "-"} ｜ 学校：{profile?.schoolName || "-"} ｜ 学院：{profile?.departmentName || "-"}</Text>
          </div>
          <Button danger onClick={() => { logout(); navigate('/login', { replace: true }); }}>退出登录</Button>
        </div>
      </Card>

      <div style={{ display: "grid", gridTemplateColumns: "260px 1fr", gap: 12, minHeight: 0 }}>
        <Card className="glass-effect" variant="borderless" style={{ borderRadius: 16, overflowY: "auto" }}>
          {navGroups.map((group) => (
            <div key={group.key} style={{ marginBottom: 12 }}>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>{group.label}</div>
              <div style={{ display: "grid", gap: 6 }}>
                {group.children.map((child) => {
                  const active = location.pathname.startsWith(child.path);
                  return (
                    <Button key={child.key} type={active ? "primary" : "default"} onClick={() => navigate(child.path)}>
                      {child.label}
                    </Button>
                  );
                })}
              </div>
            </div>
          ))}
        </Card>

        <div style={{ minHeight: 0 }}>
          <Outlet />
        </div>
      </div>
    </div>
  );
}
