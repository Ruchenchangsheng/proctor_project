import { Routes, Route, Navigate , useLocation} from "react-router-dom";
import { useAuthStore } from "./store/auth";
import { useEffect, useState } from "react";
import "./index.css";

// ===== 学校管理员端 =====
import SchoolLayout from "./pages/school/layouts/SchoolLayout.jsx";
import SchoolDepartmentsPages from "./pages/school/schoolDepartmentsPages.jsx";
import SchoolMajorsPages from "./pages/school/schoolMajorsPages.jsx";
import SchoolStudentsPages from "./pages/school/schoolStudentsPages.jsx";
import SchoolTeachersPages from "./pages/school/schoolTeachersPages.jsx";
import SchoolExamsPages from "./pages/school/SchoolExamsPages.jsx";

import Login from "./pages/Login.jsx";
import Admin from "./pages/Admin.jsx";
import Teacher from "./pages/Teacher.jsx";
import Student from "./pages/Student.jsx";
import TeacherMonitor from "./pages/TeacherMonitor.jsx";

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
  if (!me || loadingMe) return <div style={{ padding: 20 }}>正在恢复登录信息...</div>;
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

+     {/* 把子路由嵌套到 /school 下面，通过 <Outlet/> 渲染 */}
+     <Route path="/school" element={<Guard allow={["SCHOOL_ADMIN"]}><SchoolLayout/></Guard>}>
+       <Route index element={<Navigate to="school_departments_pages" replace />} />
+       <Route path="school_departments_pages" element={<SchoolDepartmentsPages />} />
+       <Route path="school_majors_pages" element={<SchoolMajorsPages />} />
+       <Route path="school_teachers_pages" element={<SchoolTeachersPages />} />
+       <Route path="school_students_pages" element={<SchoolStudentsPages />} />
        <Route path="school_exams_pages" element={<SchoolExamsPages />} />
+     </Route>


      <Route path="/teacher" element={<Guard allow={["TEACHER"]}><Teacher/></Guard>} />
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
