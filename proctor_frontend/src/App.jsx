import { Routes, Route, Navigate } from "react-router-dom";
import { useAuthStore } from "./store/auth";

// ===== 学校管理员端 =====
import SchoolLayout from "./pages/school/layouts/SchoolLayout.jsx";
import SchoolDepartmentsPages from "./pages/school/schoolDepartmentsPages.jsx";
import SchoolMajorsPages from "./pages/school/schoolMajorsPages.jsx";
import SchoolStudentsPages from "./pages/school/schoolStudentsPages.jsx";
import SchoolTeachersPages from "./pages/school/schoolTeachersPages.jsx";

import Login from "./pages/Login.jsx";
import Admin from "./pages/Admin.jsx";
import Teacher from "./pages/Teacher.jsx";
import Student from "./pages/Student.jsx";

// ===== 学生端 =====
import StudentLayout from "./pages/student/layouts/StudentLayout.jsx";
import StudentHome from "./pages/student/StudentHome.jsx";
import FaceVerify from "./pages/student/FaceVerify.jsx";
import ExamRunner from "./pages/student/ExamRunner.jsx";

function Guard({ children, allow }) {
  const token = useAuthStore((s) => s.token);
  const me = useAuthStore((s) => s.me);
  if (!token) return <Navigate to="/login" replace />;
  if (allow && me && !allow.includes(me.role)) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      <Route path="/admin" element={<Guard allow={["ADMIN"]}><Admin/></Guard>} />

+     {/* 把子路由嵌套到 /school 下面，通过 <Outlet/> 渲染 */}
+     <Route path="/school" element={<Guard allow={["SCHOOL_ADMIN"]}><SchoolLayout/></Guard>}>
+       <Route index element={<Navigate to="school_departments_pages" replace />} />
+       <Route path="school_departments_pages" element={<SchoolDepartmentsPages />} />
+       <Route path="school_majors_pages" element={<SchoolMajorsPages />} />
+       <Route path="school_teachers_pages" element={<SchoolTeachersPages />} />
+       <Route path="school_students_pages" element={<SchoolStudentsPages />} />
+     </Route>


      <Route path="/teacher" element={<Guard allow={["TEACHER"]}><Teacher/></Guard>} />


      {/* 学生端：无顶部导航的三页流转 */}
      <Route path="/student" element={<Guard allow={["STUDENT"]}><StudentLayout /></Guard>}>
        <Route index element={<Navigate to="home" replace />} />
        <Route path="home" element={<StudentHome />} />
        <Route path="verify" element={<FaceVerify />} />
        <Route path="exam" element={<ExamRunner />} />
      </Route>

      
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}
