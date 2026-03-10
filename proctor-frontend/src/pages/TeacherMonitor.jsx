import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { api } from "../apiClient";
import { createStomp } from "../stomp";
import { useAuthStore } from "../store/auth";
import "../css/student.css";

export default function TeacherMonitor() {
  const { examRoomId } = useParams();
  const location = useLocation();
  const me = useAuthStore((s) => s.me);

  const [allStudents, setAllStudents] = useState([]);
  const [liveStudents, setLiveStudents] = useState([]);
  const [msg, setMsg] = useState("");

  const [liveNotices, setLiveNotices] = useState([]);
  const [policy, setPolicy] = useState({ warningThreshold: 0.65, severeThreshold: 0.85 });
  const teacherSenderId = me?.teacherId || me?.userId || me?.id;

  const stompRef = useRef(null);
  const peersRef = useRef(new Map());
  const allStudentsRef = useRef([]);

  async function loadAlerts() {
    try {
      const r = await api.get(`/teacher/rooms/${examRoomId}/alerts`);
      if (!r.data?.ok) return;
    } catch {
      // ignore polling errors
    }
  }

  function studentNameById(studentId) {
    const hit = allStudentsRef.current.find((s) => Number(s.studentId) === Number(studentId));
    return hit?.studentName || `学生#${studentId}`;
  }
  function formatTs(ts) {
    const d = new Date(Number(ts || Date.now()));
    return d.toLocaleTimeString("zh-CN", { hour12: false });
// return d.toLocaleTimeString("ru-RU", { hour12: false });
  }

  function formatProbability(value) {
    return Number(value || 0).toFixed(6);
  }

  function mapCodeByLabel(label) {
    const m = {
      identity_face_missing: 1001,
      identity_not_match: 1002,
      multiple_face_detected: 1003,
      identity_check_error: 1099,
      abnormal_posture: 2001,
      look_left_right: 2002,
      abnormal_look_around: 2002,
      head_down: 2003,
      abnormal_head_down: 2003,
    };
    return m[label] ?? 9000;
  }

  function violationTextByCode(code) {
    const c = Number(code);
    const m = {
      // 1001: "检测不到人脸",
      // 1002: "非本人",
      // 1003: "检测到多人脸",
      // 1099: "身份核验异常",
      // 2001: "姿态异常",
      // 2002: "左右看",
      // 2003: "低头",
      // 9000: "异常行为",

      1001: "Лицо не обнаружено",
      1002: "Не владелец документа",
      1003: "Обнаружено несколько лиц",
      1099: "Ошибка проверки личности",
      2001: "Аномальная поза",
      2002: "Взгляд влево/вправо",
      2003: "Опущена голова",
      9000: "Аномальное поведение",
    };
    return m[c] || "异常行为";
  }

  function formatTs(ts) {
    const d = new Date(Number(ts || Date.now()));
    return d.toLocaleTimeString("zh-CN", { hour12: false });
  }

  function formatProbability(value) {
    return Number(value || 0).toFixed(6);
  }

  function publishSignal(payload) {
    const client = stompRef.current;
    if (!client?.connected) return;
    client.publish({ destination: "/app/exam-room.signal", body: JSON.stringify({ roomId: Number(examRoomId), ...payload }) });
  }

  function updateLiveStream(studentId, stream) {
    setLiveStudents((prev) => {
      const student = allStudentsRef.current.find((s) => Number(s.studentId) === Number(studentId));
      if (!student) return prev;
      const next = prev.filter((x) => Number(x.studentId) !== Number(studentId));
      next.push({ ...student, stream });
      return next.sort((a, b) => Number(a.studentId) - Number(b.studentId));
    });
  }

  function removeLiveStream(studentId) {
    setLiveStudents((prev) => prev.filter((x) => Number(x.studentId) !== Number(studentId)));
  }

  function closePeer(studentId) {
    const pc = peersRef.current.get(studentId);
    if (pc) {
      pc.close();
      peersRef.current.delete(studentId);
    }
    removeLiveStream(studentId);
  }

  async function createOfferForStudent(studentId) {
    if (!allStudentsRef.current.some((s) => Number(s.studentId) === Number(studentId))) return;

    if (peersRef.current.has(studentId)) {
      const existing = peersRef.current.get(studentId);
      if (["connected", "connecting"].includes(existing.connectionState)) return;
      closePeer(studentId);
    }

    const pc = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });

    pc.addTransceiver("video", { direction: "recvonly" });

    pc.onicecandidate = (e) => {
      if (!e.candidate) return;
      publishSignal({
        type: "candidate",
        senderRole: "TEACHER",
        senderId: teacherSenderId,
        targetId: studentId,
        candidate: e.candidate,
      });
    };

    pc.ontrack = (e) => {
      const [stream] = e.streams;
      if (stream) updateLiveStream(studentId, stream);
    };

    pc.onconnectionstatechange = () => {
      if (["failed", "closed", "disconnected"].includes(pc.connectionState)) {
        closePeer(studentId);
      }
    };

    peersRef.current.set(studentId, pc);

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    publishSignal({
      type: "offer",
      senderRole: "TEACHER",
      senderId: teacherSenderId,
      targetId: studentId,
      sdp: offer,
    });
  }

  useEffect(() => {
    (async () => {
      try {
        if (!teacherSenderId) {
          setMsg("无法识别当前监考老师身份，请重新登录");
          return;
        }

        if (!window.RTCPeerConnection) {
          setMsg("当前浏览器不支持实时音视频，请更换 Chrome/Edge 最新版");
          return;
        }

        const roster = await api.get(`/teacher/rooms/${examRoomId}/students`);
        if (!roster.data?.ok) {
          setMsg(roster.data?.msg || "加载考生列表失败");
          return;
        }

        const students = roster.data.students || [];
        allStudentsRef.current = students;
        setAllStudents(students);

        const client = createStomp();
        stompRef.current = client;

        client.onConnect = () => {
          client.subscribe(`/topic/exam-room.${examRoomId}`, async (frame) => {
            const signal = JSON.parse(frame.body || "{}");
            const myId = teacherSenderId;
            if (signal.senderRole === "TEACHER" && signal.senderId === myId) return;
            if (signal.targetId && signal.targetId !== myId) return;

            if (signal.type === "student-join" && signal.senderRole === "STUDENT") {
              await createOfferForStudent(Number(signal.senderId));
              return;
            }

            if (signal.type === "answer" && signal.senderRole === "STUDENT") {
              const studentId = Number(signal.senderId);
              const pc = peersRef.current.get(studentId);
              if (!pc || !signal.sdp) return;
              await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
              return;
            }

            if (signal.type === "candidate" && signal.senderRole === "STUDENT") {
              const studentId = Number(signal.senderId);
              const pc = peersRef.current.get(studentId);
              if (!pc || !signal.candidate) return;
              await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
              return;
            }

            if (signal.type === "student-leave" && signal.senderRole === "STUDENT") {
              closePeer(Number(signal.senderId));
              return;
            }

            if (signal.type === "anomaly-update") {
              if (Array.isArray(signal.events) && signal.events.length > 0) {
                const notices = signal.events.map((evt, idx) => ({
                  id: `${Date.now()}-${idx}`,
                  studentId: signal.studentId,
                  code: evt.violationCode ?? mapCodeByLabel(evt.violationType || evt.label),
                  label: violationTextByCode(evt.violationCode ?? mapCodeByLabel(evt.violationType || evt.label)),
                  type: evt.type || "event",
                  severity: evt.severity || "WARNING",
                  probability: evt.probability ?? evt.score ?? 0,
                  ts: evt.ts_ms || Date.now(),
                }));
                setLiveNotices((prev) => [...notices, ...prev].slice(0, 40));
              }
            }
          });

          publishSignal({ type: "teacher-online", senderRole: "TEACHER", senderId: teacherSenderId });
          loadAlerts();
          setMsg("");
        };

        client.activate();
      } catch (e) {
        setMsg(e.message);
      }
    })();

    return () => {
      stompRef.current?.deactivate();
      peersRef.current.forEach((pc) => pc.close());
      peersRef.current.clear();
      setLiveStudents([]);
      allStudentsRef.current = [];
    };
  }, [examRoomId, teacherSenderId]);

  const gridCols = useMemo(() => {
    const count = liveStudents.length;
    if (count <= 1) return "1fr";
    if (count <= 4) return "1fr 1fr";
    return "1fr 1fr 1fr";
  }, [liveStudents.length]);

  function isSevere(severity) {
  const v = String(severity || "WARNING").toUpperCase();
  return v === "SEVERE";
}

function severityText(severity) {
  const v = String(severity || "WARNING").toUpperCase();
  // return v === "SEVERE" ? "警告" : "严重";
  return v === "SEVERE" ? "Критическое" : "Предупреждение";
}

  return (
<div className="student-container" style={{ width: "95vw", minHeight: "95vh", maxWidth: "none", margin: "0 auto" }}>
  <div className="card" style={{ minHeight: "95vh", boxSizing: "border-box" }}>
        <div style={{ marginBottom: 10 }}>
          <Link to="/teacher">← 返回监考主页</Link>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 12 }}>
          <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 12 }}>
            <div style={{ display: "grid", gridTemplateColumns: gridCols, gap: 10 }}>
              {liveStudents.map((s) => (
                <VideoCard key={s.studentId} student={s} />
              ))}
              {liveStudents.length === 0 && <div style={{ color: "#666" }}>暂无学生进入考试实时视频</div>}
            </div>
            {msg && <div style={{ marginTop: 10, color: "#b91c1c" }}>{msg}</div>}
          </div>

          <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 12}}>
            {/* <div style={{ marginBottom: 8 }}>考试人数：{liveStudents.length} / {allStudents.length} 人</div> */}
            <div style={{ marginBottom: 8 }}>число участников экзамена：{liveStudents.length} / {allStudents.length}</div>
            {/* <h3>异常状态</h3> */}
            <h3>нештатное состояние</h3>
            <div style={{ display: "grid", gap: 6,  overflow: "auto", marginBottom: 10 }}>
              {liveNotices.map((n) => (
                <div key={n.id} style={{ border: "1px solid #fecaca", background: "#fef2f2", borderRadius: 6, padding: "6px 8px" }}>
                  <div>{studentNameById(n.studentId)} · {n.label}</div>
                  {/* <div style={{ color: isSevere(n.severity) ? "#991b1b" : "#b45309", fontSize: 12 ,height:"20px"}}>{severityText(n.severity)} 概率: {formatProbability(n.probability)} 时间: {formatTs(n.ts)}</div> */}
                <div style={{ color: isSevere(n.severity) ? "#991b1b" : "#b45309", fontSize: 12 ,height:"30px"}}>{severityText(n.severity)} вероятность: {formatProbability(n.probability)} время: {formatTs(n.ts)}</div>
                </div>
              ))}
              {liveNotices.length === 0 && <div style={{ color: "#64748b" }}>等待异常检测通知...</div>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function VideoCard({ student }) {
  const videoRef = useRef(null);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = student.stream || null;
    }
  }, [student.stream]);

  return (
    <div style={{ border: "1px solid #dbe3f1", borderRadius: 8, padding: 8 }}>
      <div style={{ width: "100%", aspectRatio: "16 / 9", background: "#111", borderRadius: 6, overflow: "hidden" }}>
        <video ref={videoRef} autoPlay playsInline muted style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      </div>
      <div style={{ marginTop: 6, fontWeight: 600 }}>{student.studentName}</div>
    </div>
  );
}