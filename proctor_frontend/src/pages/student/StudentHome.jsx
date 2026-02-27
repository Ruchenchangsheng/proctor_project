import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../apiClient";

export default function StudentHome() {
  const [p, setP] = useState(null);
  const [photoUrl, setPhotoUrl] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [msg, setMsg] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    (async () => {
      try {
        const r = await api.get("/student/profile");
        setP(r.data);
        const exams = await api.get("/student/exams");
        setSessions(exams.data || []);
        try {
          const img = await api.get("/student/photo", { responseType: "blob" });
          if (img.status !== 204) setPhotoUrl(URL.createObjectURL(img.data));
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
        </div>
      </div>

      <div style={{ marginTop: 20 }}>
        <h3>考试场次与考场信息</h3>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>考试名称</th>
                <th>开始时间</th>
                <th>结束时间</th>
                <th>考场</th>
                <th>状态</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((s) => (
                <tr key={s.sessionId}>
                  <td>{s.examName}</td>
                  <td>{s.startAt || "-"}</td>
                  <td>{s.endAt || "-"}</td>
                  <td>{s.roomId || "-"}</td>
                  <td>{s.phase === "RUNNING" ? "进行中" : s.phase === "COMPLETED" ? "已结束" : "待开始"}</td>
                  <td>
                    <button type="button" onClick={() => navigate(`/student/exams/${s.sessionId}/verify`)} disabled={s.phase === "COMPLETED"}>
                      进入考试
                    </button>
                  </td>
                </tr>
              ))}
              {(!sessions || sessions.length === 0) && (
                <tr><td colSpan={6} style={{ color: "#777" }}>暂无考试场次</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
