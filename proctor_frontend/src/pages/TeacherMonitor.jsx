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
  const [alertActive, setAlertActive] = useState([]);
  const [alertEvents, setAlertEvents] = useState([]);
  const teacherSenderId = me?.teacherId || me?.userId || me?.id;

  const stompRef = useRef(null);
  const peersRef = useRef(new Map());
  const allStudentsRef = useRef([]);

  async function loadAlerts() {
    try {
      const r = await api.get(`/teacher/rooms/${examRoomId}/alerts`);
      if (!r.data?.ok) return;
      setAlertActive(r.data.active || []);
      setAlertEvents(r.data.events || []);
    } catch {
      // ignore polling errors
    }
  }

  function studentNameById(studentId) {
    const hit = allStudentsRef.current.find((s) => Number(s.studentId) === Number(studentId));
    return hit?.studentName || `学生#${studentId}`;
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

  useEffect(() => {
    loadAlerts();
    const alertTimer = setInterval(loadAlerts, 2000);
    return () => clearInterval(alertTimer);
  }, [examRoomId]);

  const gridCols = useMemo(() => {
    const count = liveStudents.length;
    if (count <= 1) return "1fr";
    if (count <= 4) return "1fr 1fr";
    return "1fr 1fr 1fr";
  }, [liveStudents.length]);

  return (
    <div className="student-container">
      <div className="card">
        <div style={{ marginBottom: 10 }}>
          <Link to="/teacher">← 返回监考主页</Link>
        </div>
        <h2 style={{ marginBottom: 8 }}>监考房间 {location.state?.roomId || examRoomId}</h2>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 12 }}>
          <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 12 }}>
            <div style={{ marginBottom: 8 }}>已进入实时监考：{liveStudents.length} / {allStudents.length} 人</div>
            <div style={{ display: "grid", gridTemplateColumns: gridCols, gap: 10 }}>
              {liveStudents.map((s) => (
                <VideoCard key={s.studentId} student={s} />
              ))}
              {liveStudents.length === 0 && <div style={{ color: "#666" }}>暂无学生进入考试实时视频</div>}
            </div>
            {msg && <div style={{ marginTop: 10, color: "#b91c1c" }}>{msg}</div>}
          </div>

          <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 12 }}>
            <h3>异常状态（实时）</h3>
            <div style={{ fontSize: 13, color: "#334155", marginBottom: 8 }}>当前进行中：{alertActive.length}</div>
            <div style={{ display: "grid", gap: 6, maxHeight: 180, overflow: "auto", marginBottom: 10 }}>
              {alertActive.map((a, idx) => (
                <div key={`${a.studentId}-${a.label}-${idx}`} style={{ background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: 6, padding: "6px 8px" }}>
                  <div>{studentNameById(a.studentId)} · {a.label}</div>
                  <div style={{ color: "#9a3412", fontSize: 12 }}>持续 {(Number(a.durationMs || 0) / 1000).toFixed(1)}s</div>
                </div>
              ))}
              {alertActive.length === 0 && <div style={{ color: "#64748b" }}>暂无进行中的异常</div>}
            </div>

            <div style={{ fontSize: 13, color: "#334155", marginBottom: 6 }}>事件告警（enter/exit/min_dur）</div>
            <div style={{ display: "grid", gap: 6, maxHeight: 220, overflow: "auto" }}>
              {alertEvents.slice(0, 30).map((e, idx) => (
                <div key={`${e.studentId}-${e.label}-${e.exitTs}-${idx}`} style={{ border: "1px solid #e2e8f0", borderRadius: 6, padding: "6px 8px" }}>
                  <div>{studentNameById(e.studentId)} · {e.label}</div>
                  <div style={{ color: "#64748b", fontSize: 12 }}>{e.type} · 时长 {(Number(e.durationMs || 0) / 1000).toFixed(1)}s</div>
                </div>
              ))}
              {alertEvents.length === 0 && <div style={{ color: "#64748b" }}>暂无告警事件</div>}
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
