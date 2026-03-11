import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { useAuthStore } from "./store/auth";
import { useEffect, useState } from "react";
import "./index.css";

// ===== 学校管理员端 =====
import SchoolLayout from "./pages/school/layouts/SchoolLayout.jsx";
import SchoolDepartmentsPages from "./pages/school/SchoolDepartmentsPages.jsx";
import SchoolMajorsPages from "./pages/school/SchoolMajorsPages.jsx";
import SchoolStudentsPages from "./pages/school/SchoolStudentsPages.jsx";
import SchoolTeachersPages from "./pages/school/SchoolTeachersPages.jsx";
import SchoolExamsPages from "./pages/school/SchoolExamsPages.jsx";

import Login from "./pages/Login.jsx";
import Admin from "./pages/Admin.jsx";
import Student from "./pages/Student.jsx";
import TeacherMonitor from "./pages/teacher/TeacherMonitor.jsx";
import TeacherLayout from "./pages/teacher/TeacherLayout.jsx";
import TeacherTasksPage from "./pages/teacher/TeacherTasksPage.jsx";
import TeacherEvidenceExamsPage from "./pages/teacher/TeacherEvidenceExamsPage.jsx";
import TeacherEvidenceStudentsPage from "./pages/teacher/TeacherEvidenceStudentsPage.jsx";
import TeacherEvidenceStudentDetailPage from "./pages/teacher/TeacherEvidenceStudentDetailPage.jsx";

// ===== 学生端 =====
import StudentLayout from "./pages/student/layouts/StudentLayout.jsx";
import StudentHome from "./pages/student/StudentHome.jsx";
import FaceVerify from "./pages/student/FaceVerify.jsx";
import ExamRunner from "./pages/student/ExamRunner.jsx";
import StudentExamVerify from "./pages/student/StudentExamVerify.jsx";

function Guard({ children, allow }) {
  const token = useAuthStore((s) => s.token);
  const me = useAuthStore((s) => s.me);

  const bootstrapAfterLogin = useAuthStore((s) => s.bootstrapAfterLogin);
  const [loadingMe, setLoadingMe] = useState(false);

  useEffect(() => {
    if (!token || me) return;
    setLoadingMe(true);
    bootstrapAfterLogin().catch(() => {
      useAuthStore.getState().logout();
    }).finally(() => setLoadingMe(false));
  }, [token, me, bootstrapAfterLogin]);

  if (!token) return <Navigate to="/login" replace />;
  
  // 给加载提示也加上玻璃效果
  if (!me || loadingMe) return <div className="glass-effect" style={{ padding: 20, margin: '20vh auto', width: 'fit-content', borderRadius: '12px' }}>正在恢复登录信息...</div>;
  
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

      <Route path="/admin" element={<Guard allow={["ADMIN"]}><Admin /></Guard>} />

      {/* 把子路由嵌套到 /school 下面，通过 <Outlet/> 渲染 */}
      <Route path="/school" element={<Guard allow={["SCHOOL_ADMIN"]}><SchoolLayout/></Guard>}>
        <Route index element={<Navigate to="school_departments_pages" replace />} />
        <Route path="school_departments_pages" element={<SchoolDepartmentsPages />} />
        <Route path="school_majors_pages" element={<SchoolMajorsPages />} />
        <Route path="school_teachers_pages" element={<SchoolTeachersPages />} />
        <Route path="school_students_pages" element={<SchoolStudentsPages />} />
        <Route path="school_exams_pages" element={<SchoolExamsPages />} />
      </Route>

      <Route path="/teacher" element={<Guard allow={["TEACHER"]}><TeacherLayout /></Guard>}>
        <Route index element={<Navigate to="tasks/running" replace />} />
        <Route path="tasks/all" element={<TeacherTasksPage phase="ALL" />} />
        <Route path="tasks/pending" element={<TeacherTasksPage phase="PENDING" />} />
        <Route path="tasks/running" element={<TeacherTasksPage phase="RUNNING" />} />
        <Route path="tasks/completed" element={<TeacherTasksPage phase="COMPLETED" />} />
        <Route path="evidence/exams" element={<TeacherEvidenceExamsPage />} />
        <Route path="evidence/exams/:examRoomId/students" element={<TeacherEvidenceStudentsPage />} />
        <Route path="evidence/exams/:examRoomId/students/:studentId" element={<TeacherEvidenceStudentDetailPage />} />
      </Route>
      <Route path="/teacher/monitor/:examRoomId" element={<Guard allow={["TEACHER"]}><TeacherMonitor/></Guard>} />

      {/* 学生端：无顶部导航的三页流转 */}
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