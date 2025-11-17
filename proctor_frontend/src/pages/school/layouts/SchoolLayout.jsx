import { useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { api } from "../../../apiClient";
import { useAuthStore } from "../../../store/auth";
import "../../../css/school.css";

export default function SchoolLayout() {
  const [school, setSchool] = useState(null);
  const me = useAuthStore((s) => s.me);
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();

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

  return (
    <>
      <header className="school-topbar">
        <div className="school-brand">学校后台</div>
        <nav className="school-nav">
          <NavLink to="school_departments_pages" className={({isActive}) => isActive ? "active" : ""}>学院</NavLink>
          <NavLink to="school_majors_pages" className={({isActive}) => isActive ? "active" : ""}>专业</NavLink>
          <NavLink to="school_teachers_pages" className={({isActive}) => isActive ? "active" : ""}>老师</NavLink>
          <NavLink to="school_students_pages" className={({isActive}) => isActive ? "active" : ""}>学生</NavLink>
        </nav>

        <div className="school-right">
          <span className="school-badge">学校：{school?.name || "加载中..."}</span>
          <span className="school-badge">账号：{me?.email || "--"}</span>
          <button className="school-logout" onClick={onLogout}>退出</button>
        </div>
      </header>

      <main className="school-container">
        <Outlet context={{ school }} />
      </main>
    </>
  );
}
