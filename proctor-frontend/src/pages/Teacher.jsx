import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../apiClient";
import "../css/student.css";

const phaseTabs = [
  { key: "ALL", label: "全部考试" },
  { key: "PENDING", label: "待考试" },
  { key: "RUNNING", label: "考试中" },
  { key: "COMPLETED", label: "已完成" },
];

export default function Teacher() {
  const [profile, setProfile] = useState(null);
  const [phase, setPhase] = useState("ALL");
  const [tasks, setTasks] = useState([]);
  const [msg, setMsg] = useState("");
  const [detail, setDetail] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    api.get("/teacher/profile").then((r) => setProfile(r.data)).catch((e) => setMsg(e.message));
  }, []);

  useEffect(() => {
    loadTasks(phase);
  }, [phase]);

  async function loadTasks(nextPhase) {
    try {
      const params = nextPhase === "ALL" ? {} : { phase: nextPhase };
      const r = await api.get("/teacher/invigilations", { params });
      setTasks(r.data || []);
    } catch (e) {
      setMsg(e.message);
    }
  }

  function openAction(item) {
    if (item.phase === "RUNNING") {
      navigate(`/teacher/monitor/${item.examRoomId}`, { state: { roomId: item.roomId, examName: item.examName } });
      return;
    }
    setDetail(item);
  }

  const title = useMemo(() => {
    const found = phaseTabs.find((t) => t.key === phase);
    return found?.label || "全部考试";
  }, [phase]);

  if (!profile) return <div className="student-container"><div className="card">{msg || "加载中..."}</div></div>;

  return (
    <div className="student-container">
      <div className="card">
        <h2>监考老师主页</h2>
        <div><b>姓名：</b>{profile.name}</div>
        <div><b>学校：</b>{profile.schoolName || "-"}</div>
        <div><b>学院：</b>{profile.departmentName || "-"}</div>
      </div>

      <div className="card">
        <h3>全部监考任务</h3>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
          {phaseTabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              className="btn-primary"
              style={{ background: phase === tab.key ? "#2563eb" : "#64748b" }}
              onClick={() => setPhase(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <TaskList
          data={tasks}
          title={title}
          onAction={openAction}
          teacherName={profile.name}
        />
        {msg && <div style={{ marginTop: 10, color: "#b91c1c" }}>{msg}</div>}
      </div>

      {detail && (
        <div style={overlayStyle} onClick={() => setDetail(null)}>
          <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>监考任务详情</h3>
            <div><b>考试：</b>{detail.examName}</div>
            <div><b>监考老师：</b>{profile.name}</div>
            <div><b>考场：</b>{detail.roomId}</div>
            <div style={{ marginTop: 8 }}><b>考生名单：</b></div>
            <ul style={{ marginTop: 6 }}>
              {(detail.students || []).map((s) => <li key={s.studentId}>{s.studentName}</li>)}
              {(!detail.students || detail.students.length === 0) && <li>暂无考生</li>}
            </ul>
            <div style={{ textAlign: "right" }}>
              <button type="button" onClick={() => setDetail(null)}>关闭</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TaskList({ data, title, onAction, teacherName }) {
  return (
    <div>
      <div style={{ color: "#64748b", marginBottom: 8 }}>当前筛选：{title}（共 {data?.length || 0} 条）</div>
      <div style={{ display: "grid", gap: 10 }}>
        {(data || []).map((item) => {
          const isRunning = item.phase === "RUNNING";
          return (
            <div key={`${item.examRoomId}-${item.examId}`} style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 12, display: "grid", gridTemplateColumns: "1fr auto", gap: 8, alignItems: "center" }}>
              <div>
                <div><b>{item.examName}</b>（{item.phase === "PENDING" ? "待考试" : item.phase === "RUNNING" ? "考试中" : "已完成"}）</div>
                <div>时间：{item.startAt || "-"} ~ {item.endAt || "-"}</div>
                <div>学院/专业：{item.departmentName || "-"} / {item.majorName || "-"}</div>
                <div>考场：{item.roomId}（容量 {item.capacity}，当前 {item.studentCount} 人）</div>
                {!isRunning && <div style={{ color: "#64748b", fontSize: 13 }}>监考老师：{teacherName}</div>}
              </div>
              <div>
                <button type="button" className="btn-primary" onClick={() => onAction(item)} style={{ minWidth: 88 }}>
                  {isRunning ? "进入监考" : "查看"}
                </button>
              </div>
            </div>
          );
        })}
        {(!data || data.length === 0) && <div style={{ color: "#666" }}>当前筛选下暂无任务</div>}
      </div>
    </div>
  );
}

const overlayStyle = {
  position: "fixed",
  inset: 0,
  background: "rgba(15,23,42,0.45)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 20,
};

const modalStyle = {
  width: "min(560px, 90vw)",
  background: "#fff",
  borderRadius: 12,
  padding: 16,
  border: "1px solid #e5e7eb",
};