// src/pages/student/StudentHome.jsx
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../apiClient";

export default function StudentHome() {
  const [p, setP] = useState(null);
  const [photoUrl, setPhotoUrl] = useState(null);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const r = await api.get("/student/profile");
        setP(r.data);
        // 受 JWT 保护的图片：用 axios 拉 blob，再转 Object URL
        try {
          const img = await api.get("/student/photo", { responseType: "blob" });
          if (img.status === 204) {
            setPhotoUrl(null);
          } else {
            setPhotoUrl(URL.createObjectURL(img.data));
          }
        } catch {
          setPhotoUrl(null);
        }
      } catch (e) {
        setMsg(e.message);
      }
    })();
  }, []);

  if (!p) return <div className="card">{msg || "加载中..."}</div>;

  return (
    <div className="card">
      <h2>考生主页</h2>
      <div className="profile">
        <div className="profile-photo">
          {photoUrl ? <img src={photoUrl} alt="注册照" /> : <div className="no-photo">无登记照片</div>}
        </div>
        <div className="profile-info">
          <div><b>姓名：</b>{p.name}</div>
          <div><b>学校：</b>{p.schoolName || "-"}</div>
          <div><b>学院：</b>{p.departmentName || "-"}</div>
          <div><b>专业：</b>{p.majorName || "-"}</div>
          <div className="start-row">
            <Link className="btn-primary" to="/student/verify">开始考试</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
