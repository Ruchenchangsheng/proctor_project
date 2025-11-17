// src/pages/student/layouts/StudentLayout.jsx
import { Outlet } from "react-router-dom";
import "../../../css/student.css";

export default function StudentLayout() {
  return (
    <main className="student-container">
      <Outlet />
    </main>
  );
}
