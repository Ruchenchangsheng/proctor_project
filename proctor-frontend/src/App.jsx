// App 负责组装整套前端路由树，并根据登录态和角色把用户导向管理员、学校管理员、教师或学生端页面。
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { useAuthStore } from "./store/auth";
import { useEffect, useState } from "react";
import { Button, Card, Typography } from "antd";
import { useTranslation } from "react-i18next";
import "./index.css";
import ChangePasswordButton from "./components/ChangePasswordButton.jsx";
import LanguageSwitcher from "./components/LanguageSwitcher.jsx";

// ===== 学校管理员端 =====
import SchoolLayout from "./pages/school/layouts/SchoolLayout.jsx";
import SchoolDepartmentsPages from "./pages/school/SchoolDepartmentsPages.jsx";
import SchoolMajorsPages from "./pages/school/SchoolMajorsPages.jsx";
import SchoolStudentsPages from "./pages/school/SchoolStudentsPages.jsx";
import SchoolTeachersPages from "./pages/school/SchoolTeachersPages.jsx";
import SchoolExamsPages from "./pages/school/SchoolExamsPages.jsx";
import SchoolExamPolicyPage from "./pages/school/SchoolExamPolicyPage.jsx";
import SchoolCreateExamPage from "./pages/school/SchoolCreateExamPage.jsx";
import SchoolEvidenceExamsPage from "./pages/school/SchoolEvidenceExamsPage.jsx";
import SchoolEvidenceStudentsPage from "./pages/school/SchoolEvidenceStudentsPage.jsx";
import SchoolEvidenceStudentDetailPage from "./pages/school/SchoolEvidenceStudentDetailPage.jsx";

import Login from "./pages/Login.jsx";
import Admin from "./pages/Admin.jsx";
import AdminLayout from "./pages/admin/layouts/AdminLayout.jsx";
import AdminSchoolOverviewPage from "./pages/admin/AdminSchoolOverviewPage.jsx";
import AdminSchoolAdminsPage from "./pages/admin/AdminSchoolAdminsPage.jsx";
import AdminExamsPage from "./pages/admin/AdminExamsPage.jsx";
import AdminUsersPage from "./pages/admin/AdminUsersPage.jsx";
import AdminEvidencePage from "./pages/admin/AdminEvidencePage.jsx";
import AdminSettingsPage from "./pages/admin/AdminSettingsPage.jsx";
import AdminAuditLogsPage from "./pages/admin/AdminAuditLogsPage.jsx";
import AdminNotificationsPage from "./pages/admin/AdminNotificationsPage.jsx";

import TeacherMonitor from "./pages/teacher/TeacherMonitor.jsx";
import TeacherLayout from "./pages/teacher/layouts/TeacherLayouts.jsx";
import TeacherTasksPage from "./pages/teacher/TeacherTasksPage.jsx";
import TeacherEvidenceExamsPage from "./pages/teacher/TeacherEvidenceExamsPage.jsx";
import TeacherEvidenceStudentsPage from "./pages/teacher/TeacherEvidenceStudentsPage.jsx";
import TeacherEvidenceStudentDetailPage from "./pages/teacher/TeacherEvidenceStudentDetailPage.jsx";
import TeacherTaskDetailPage from "./pages/teacher/TeacherTaskDetailPage.jsx";

// ===== 学生端 =====
import StudentLayout from "./pages/student/layouts/StudentLayout.jsx";
import StudentHome from "./pages/student/StudentHome.jsx";
import FaceVerify from "./pages/student/FaceVerify.jsx";
import ExamRunner from "./pages/student/ExamRunner.jsx";
import StudentExamVerify from "./pages/student/StudentExamVerify.jsx";

const { Title, Text } = Typography;

// 负责把页面中的一段独立交互逻辑拆出来，避免主组件渲染区混入过多细节。
// 跟读这个函数时，建议同时留意它依赖了哪些 state/ref，以及执行后会触发哪些界面刷新。
function Guard({ children, allow }) {
  const { t } = useTranslation();
  const token = useAuthStore((s) => s.token);
  const me = useAuthStore((s) => s.me);
  const logout = useAuthStore((s) => s.logout);

  const bootstrapAfterLogin = useAuthStore((s) => s.bootstrapAfterLogin);
  const [loadingMe, setLoadingMe] = useState(false);

  // 这个 effect 负责在依赖变化时同步加载数据或建立/释放副作用。
  // 阅读时可以重点看依赖数组、内部异步流程以及 return 清理逻辑三部分。
  useEffect(() => {
    // 令牌恢复后立即拉取 /api/me，避免刷新页面后角色上下文丢失。
    if (!token || me) return;
    setLoadingMe(true);
    bootstrapAfterLogin().catch(() => {
      useAuthStore.getState().logout();
    }).finally(() => setLoadingMe(false));
  }, [token, me, bootstrapAfterLogin]);

  if (!token) return <Navigate to="/login" replace />;

  // 给加载提示也加上玻璃效果
  if (!me || loadingMe) {
    return (
      <div className="glass-effect" style={{ padding: 20, margin: "20vh auto", width: "fit-content", borderRadius: "12px" }}>
        {t("正在恢复登录信息...")}
      </div>
    );
  }

  if (me?.mustChangePassword) {
    return (
      <div style={{ maxWidth: 560, margin: "12vh auto", width: "100%", padding: "0 20px" }}>
        <Card className="glass-effect" variant={false} style={{ borderRadius: 18, padding: "16px 8px" }}>
          <div className="app-login-toolbar" style={{ marginBottom: 12 }}>
            <LanguageSwitcher compact />
          </div>
          <Title level={3} style={{ marginTop: 0 }}>{t("请先修改密码")}</Title>
          <Text type="secondary" style={{ display: "block", marginBottom: 20 }}>
            {t("当前账号处于首次登录或密码重置后的安全状态，修改密码后才能继续访问系统功能。")}
          </Text>
          <ChangePasswordButton
            hideButton
            defaultOpen
            modalTitle={t("请先修改密码")}
            onSuccess={() => {}}
          />
          <Button danger style={{ marginTop: 12 }} onClick={() => { logout(); location.replace("/login"); }}>
            {t("退出登录")}
          </Button>
        </Card>
      </div>
    );
  }

  if (allow && !allow.includes(me.role)) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  const location = useLocation();
  const isLoginPage = location.pathname === "/login";

  return (
    <div className={isLoginPage ? "app-login" : "app-shell"}>
      <Routes>
        <Route path="/login" element={<Login />} />

        {/* 管理员端主要处理平台级资源：学校、用户、考试和系统设置。 */}
        <Route path="/admin" element={<Guard allow={["ADMIN"]}><AdminLayout /></Guard>}>
          <Route index element={<Navigate to="school-overview" replace />} />
          <Route path="school-overview" element={<AdminSchoolOverviewPage />} />
          <Route path="exams" element={<AdminExamsPage />} />
          <Route path="users" element={<AdminUsersPage />} />
          <Route path="evidence" element={<AdminEvidencePage />} />
          <Route path="schools/list" element={<Admin mode="list" />} />
          <Route path="schools/add" element={<Admin mode="add" />} />
          <Route path="school-admins" element={<AdminSchoolAdminsPage />} />
          <Route path="settings" element={<AdminSettingsPage />} />
          <Route path="audit-logs" element={<AdminAuditLogsPage />} />
          <Route path="notifications" element={<AdminNotificationsPage />} />
        </Route>

        {/* 把子路由嵌套到 /school 下面，通过 <Outlet/> 渲染 */}
        <Route path="/school" element={<Guard allow={["SCHOOL_ADMIN"]}><SchoolLayout /></Guard>}>
          <Route index element={<Navigate to="departments/list" replace />} />
          <Route path="departments/list" element={<SchoolDepartmentsPages mode="list" />} />
          <Route path="departments/add" element={<SchoolDepartmentsPages mode="add" />} />
          <Route path="majors/list" element={<SchoolMajorsPages mode="list" />} />
          <Route path="majors/add" element={<SchoolMajorsPages mode="add" />} />
          <Route path="teachers/list" element={<SchoolTeachersPages mode="list" />} />
          <Route path="teachers/add" element={<SchoolTeachersPages mode="add" />} />
          <Route path="students/list" element={<SchoolStudentsPages mode="list" />} />
          <Route path="students/add" element={<SchoolStudentsPages mode="add" />} />
          <Route path="school_departments_pages" element={<Navigate to="/school/departments/list" replace />} />
          <Route path="school_majors_pages" element={<Navigate to="/school/majors/list" replace />} />
          <Route path="school_teachers_pages" element={<Navigate to="/school/teachers/list" replace />} />
          <Route path="school_students_pages" element={<Navigate to="/school/students/list" replace />} />
          <Route path="exam_anomaly_settings" element={<SchoolExamPolicyPage />} />
          <Route path="exam_create" element={<SchoolCreateExamPage />} />
          <Route path="exam_overview" element={<SchoolExamsPages />} />
          <Route path="evidence/exams" element={<SchoolEvidenceExamsPage />} />
          <Route path="evidence/exams/:examId/students" element={<SchoolEvidenceStudentsPage />} />
          <Route path="evidence/exams/:examId/students/:studentId" element={<SchoolEvidenceStudentDetailPage />} />
          <Route path="school_exams_pages" element={<Navigate to="/school/exam_overview" replace />} />
        </Route>

        <Route path="/teacher" element={<Guard allow={["TEACHER"]}><TeacherLayout /></Guard>}>
          <Route index element={<Navigate to="tasks/running" replace />} />
          <Route path="tasks/all" element={<TeacherTasksPage phase="ALL" />} />
          <Route path="tasks/pending" element={<TeacherTasksPage phase="PENDING" />} />
          <Route path="tasks/running" element={<TeacherTasksPage phase="RUNNING" />} />
          <Route path="tasks/completed" element={<TeacherTasksPage phase="COMPLETED" />} />
          <Route path="tasks/:examRoomId/detail" element={<TeacherTaskDetailPage />} />
          <Route path="evidence/exams" element={<TeacherEvidenceExamsPage />} />
          <Route path="evidence/exams/:examRoomId/students" element={<TeacherEvidenceStudentsPage />} />
          <Route path="evidence/exams/:examRoomId/students/:studentId" element={<TeacherEvidenceStudentDetailPage />} />
        </Route>
        <Route path="/teacher/monitor/:examRoomId" element={<Guard allow={["TEACHER"]}><TeacherMonitor /></Guard>} />

        {/* 学生端围绕“首页 -> 考前核验 -> 正式考试”三段式流程组织。 */}
        <Route path="/student" element={<Guard allow={["STUDENT"]}><StudentLayout /></Guard>}>
          <Route index element={<Navigate to="home" replace />} />
          <Route path="home" element={<StudentHome />} />
          <Route path="verify" element={<FaceVerify />} />
          <Route path="exam" element={<ExamRunner />} />
          <Route path="exams/:sessionId/verify" element={<StudentExamVerify />} />
          <Route path="exams/:sessionId/run" element={<ExamRunner />} />
        </Route>

        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </div>
  );
}
