import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { api } from "../../apiClient";
import { createStomp } from "../../stomp";
import { useAuthStore } from "../../store/auth";
import { Alert, Button, Card, Empty, Space, Tag, Typography, message } from "antd";

const { Title, Text } = Typography;

export default function TeacherMonitor() {
  const { examRoomId } = useParams();
  const location = useLocation();
  const me = useAuthStore((s) => s.me);

  const [allStudents, setAllStudents] = useState([]);
  const [liveStudents, setLiveStudents] = useState([]);
  const [msg, setMsg] = useState("");

  const [liveNotices, setLiveNotices] = useState([]);
  const [evidences, setEvidences] = useState([]);
  const [mediaLoadingId, setMediaLoadingId] = useState("");
  const teacherSenderId = me?.teacherId || me?.userId || me?.id;

  const stompRef = useRef(null);
  const peersRef = useRef(new Map());
  const allStudentsRef = useRef([]);
  const lastOfferAttemptRef = useRef(new Map());

  function normalizeId(value) {
    if (value === null || value === undefined || value === "") return "";
    return String(value);
  }

  function studentNameById(studentId) {
    const hit = allStudentsRef.current.find((s) => Number(s.studentId) === Number(studentId));
    return hit?.studentName || `学生#${studentId}`;
  }

  function formatTs(ts) {
    let d;
    if (typeof ts === "number") d = new Date(ts);
    else if (typeof ts === "string" && /^\d+$/.test(ts)) d = new Date(Number(ts));
    else d = new Date(ts || Date.now());
    if (Number.isNaN(d.getTime())) d = new Date();
    return d.toLocaleTimeString("zh-CN", { hour12: false });
  }

  function formatProbability(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return "-";
    return n.toFixed(6);
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
      1001: "检测不到人脸",
      1002: "非本人",
      1003: "检测到多人脸",
      1099: "身份核验异常",
      2001: "姿态异常",
      2002: "左右看",
      2003: "低头",
      9000: "异常行为",
    };
    return m[c] || "异常行为";
  }

  function publishSignal(payload) {
    const client = stompRef.current;
    if (!client?.connected) return;
    client.publish({
      destination: "/app/exam-room.signal",
      body: JSON.stringify({ roomId: Number(examRoomId), ...payload }),
    });
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

  function upsertNotices(events = [], fallbackStudentId = null) {
    const notices = (events || [])
      .filter((evt) => evt && typeof evt === "object")
      .map((evt, idx) => {
        const code = evt.violationCode ?? mapCodeByLabel(evt.violationType || evt.label);
        const probability = evt.probability ?? evt.score;
        const ts = evt.ts_ms ?? evt.tsMs ?? evt.exitTs ?? evt.enterTs ?? evt.createdAt ?? evt.exitAt ?? Date.now();
        return {
          id: evt.id || `${Date.now()}-${idx}`,
          studentId: evt.studentId ?? fallbackStudentId,
          code,
          label: violationTextByCode(code),
          severity: evt.severity || "WARNING",
          probability,
          ts,
        };
      });

    if (notices.length === 0) return;

    setLiveNotices((prev) => {
      const merged = [...notices, ...prev];
      const dedup = new Map();
      merged.forEach((n) => {
        if (!n || typeof n !== "object") return;
        const key = `${n.studentId || "x"}-${n.code}-${String(n.ts)}`;
        if (!dedup.has(key)) dedup.set(key, n);
      });
      return Array.from(dedup.values()).slice(0, 60);
    });
  }

  function upsertEvidences(items = []) {
    if (!Array.isArray(items) || items.length === 0) return;
    setEvidences((prev) => {
      const merged = [...items, ...prev];
      const dedup = new Map();
      merged.forEach((it, idx) => {
        if (!it || typeof it !== "object") return;
        const key = it.evidenceId || `${it.studentId || "x"}-${it.anomalyTsMs || it.anomalyAt || idx}`;
        if (!dedup.has(key)) dedup.set(key, it);
      });
      return Array.from(dedup.values())
        .sort((a, b) => Number(b?.anomalyTsMs || 0) - Number(a?.anomalyTsMs || 0))
        .slice(0, 50);
    });
  }

  async function openEvidence(item, mode = "preview") {
    const evidenceId = item?.evidenceId;
    if (!evidenceId) return;
    try {
      setMediaLoadingId(evidenceId + mode);
      const res = await api.get(`/evidence/${evidenceId}/media`, {
        responseType: "blob",
        params: { disposition: mode === "download" ? "attachment" : "inline" },
      });
      const blob = res.data;
      const contentType = res.headers?.["content-type"] || item.mediaType || "application/octet-stream";
      const ext = item.mediaExt || (contentType.includes("mp4") ? "mp4" : contentType.includes("webm") ? "webm" : "gif");
      const url = URL.createObjectURL(blob);
      if (mode === "download") {
        const a = document.createElement("a");
        a.href = url;
        a.download = `${evidenceId}.${ext}`;
        a.click();
      } else {
        window.open(url, "_blank", "noopener,noreferrer");
      }
      window.setTimeout(() => URL.revokeObjectURL(url), 30000);
    } catch (e) {
      message.error(e.message || "证据加载失败");
    } finally {
      setMediaLoadingId("");
    }
  }

  async function loadAlertsSnapshot() {
    try {
      const r = await api.get(`/teacher/rooms/${examRoomId}/alerts`);
      if (!r.data?.ok) return;
      const events = Array.isArray(r.data.events) ? r.data.events : [];
      const evidenceItems = Array.isArray(r.data.evidences) ? r.data.evidences : [];
      upsertNotices(events);
      upsertEvidences(evidenceItems);
      if (r.data?.examEnded) {
        setMsg("考试已结束，监考画面已停止更新");
      }
    } catch {
      // 忽略轮询失败，保持实时订阅
    }
  }

  function removeLiveStream(studentId) {
    setLiveStudents((prev) => prev.filter((x) => Number(x.studentId) !== Number(studentId)));
  }

  function hasActiveRemoteVideo(peer) {
    if (!peer) return false;
    return peer.getReceivers().some((receiver) => receiver.track?.kind === "video" && receiver.track.readyState === "live");
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
      if (["connected", "connecting", "new"].includes(existing.connectionState)) return;
      if (existing.signalingState === "have-local-offer") return;
      closePeer(studentId);
    }

    const pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });

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

  async function offerForAllStudents() {
    const tasks = allStudentsRef.current.map((s) => createOfferForStudent(Number(s.studentId)));
    await Promise.allSettled(tasks);
  }

  useEffect(() => {
    let reconnectTimer = null;
    let alertsTimer = null;
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
            let signal = {};
            try {
              signal = JSON.parse(frame.body || "{}");
            } catch {
              return;
            }
            const myId = normalizeId(teacherSenderId);
            const senderId = normalizeId(signal.senderId);
            const targetId = normalizeId(signal.targetId);

            if (signal.senderRole === "TEACHER" && senderId === myId) return;
            if (targetId && targetId !== myId) return;

            if (signal.type === "student-join" && signal.senderRole === "STUDENT") {
              await createOfferForStudent(Number(signal.senderId));
              return;
            }

            if (signal.type === "answer" && signal.senderRole === "STUDENT") {
              const studentId = Number(signal.senderId);
              const pc = peersRef.current.get(studentId);
              if (!pc || !signal.sdp) return;
              if (pc.signalingState !== "have-local-offer") return;
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
                upsertNotices(signal.events, signal.studentId);
              }
              if (Array.isArray(signal.evidences) && signal.evidences.length > 0) {
                upsertEvidences(signal.evidences);
              }
              if (Array.isArray(signal.history) && signal.history.length > 0) {
                upsertNotices(signal.history, signal.studentId);
              }
            }
          });

          publishSignal({ type: "teacher-online", senderRole: "TEACHER", senderId: teacherSenderId });
          offerForAllStudents();
          loadAlertsSnapshot();
          alertsTimer = window.setInterval(loadAlertsSnapshot, 3000);
          reconnectTimer = window.setInterval(() => {
            allStudentsRef.current.forEach((s) => {
              const sid = Number(s.studentId);
              const peer = peersRef.current.get(sid);
              if (!hasVideo) {
                const now = Date.now();
                const last = lastOfferAttemptRef.current.get(sid) || 0;
                // 单个学生最小重试间隔 0.5 秒
                if (now - last >= 500) {
                  lastOfferAttemptRef.current.set(sid, now);
                  closePeer(sid);
                  createOfferForStudent(sid);
                }
              }
            });
            // 每 0.5 秒扫描一次每个学生的视频流状态。
          }, 500);
          setMsg("");
        };

        client.activate();
      } catch (e) {
        setMsg(e.message || "连接监考服务失败");
      }
    })();

    return () => {
      if (reconnectTimer) window.clearInterval(reconnectTimer);
      if (alertsTimer) window.clearInterval(alertsTimer);
      stompRef.current?.deactivate();
      peersRef.current.forEach((pc) => pc.close());
      peersRef.current.clear();
      lastOfferAttemptRef.current.clear();
      setLiveStudents([]);
      allStudentsRef.current = [];
    };
  }, [examRoomId, teacherSenderId]);

  const monitorGridTemplate = useMemo(() => {
    if (liveStudents.length <= 1) return "1fr";
    if (liveStudents.length <= 4) return "repeat(2, minmax(0, 1fr))";
    return "repeat(3, minmax(0, 1fr))";
  }, [liveStudents.length]);

  function isSevere(severity) {
    return String(severity || "WARNING").toUpperCase() === "SEVERE";
  }

  function severityText(severity) {
    return isSevere(severity) ? "严重" : "警告";
  }

  return (
    <div style={{ width: "100%", height: "calc(94vh - 8px)", margin: "0 auto", display: "flex", flexDirection: "column", gap: 12, overflow: "hidden" }}>
      <Card className="glass-effect" variant="borderless" style={{ borderRadius: 16, flex: "0 0 auto" }}>
        <Space orientation="vertical" size={8} style={{ width: "100%" }}>
          <Link to="/teacher/tasks/running">← 返回监考主页</Link>
          <div>
            <Text type="secondary">考试：{location.state?.examName || "-"}｜考场：{location.state?.roomId || examRoomId}</Text>
          </div>
        </Space>
      </Card>

      <div style={{ display: "flex", gap: 12, minHeight: 0, flex: 1, overflow: "hidden" }}>
        <Card className="glass-effect" variant="borderless" style={{ borderRadius: 16, width: "78%", minWidth: 0, minHeight: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>
          <div style={{ display: "grid", gridTemplateColumns: monitorGridTemplate, gap: 10, overflowY: "auto", minHeight: 0, flex: 1, paddingRight: 4 }}>
            {liveStudents.map((s) => <VideoCard key={s.studentId} student={s} />)}
            {liveStudents.length === 0 && <Empty description="暂无学生进入考试实时视频" style={{ padding: "40px 0" }} />}
          </div>
          {msg && <Alert style={{ marginTop: 12 }} type="error" showIcon message={msg} />}
        </Card>

        <Card
          className="glass-effect"
          variant="borderless"
          style={{ borderRadius: 16, width: "22%", minWidth: 320, minHeight: 0, overflow: "hidden" }}
          styles={{ body: { display: "flex", flexDirection: "column", minHeight: 0, height: "100%", overflow: "hidden" } }}
        >
          <div style={{ flex: "0 0 auto", borderBottom: "1px solid #e5e7eb", paddingBottom: 8, marginBottom: 8 }}>
            <Text>在线人数：{liveStudents.length} / {allStudents.length}</Text>
            <Title level={5} style={{ margin: 0 }}>异常状态</Title>
          </div>

          <div style={{ flex: 1, minHeight: 0, overflowY: "auto", paddingRight: 4, display: "flex", flexDirection: "column", gap: 8 }}>
            <Title level={5} style={{ margin: 0 }}>异常通知</Title>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {liveNotices.length === 0 && <Text type="secondary">等待异常检测通知...</Text>}
              {liveNotices.map((notice) => {
                const noticeKey = notice?.id || `${notice?.studentId || "x"}-${notice?.code || "unknown"}-${String(notice?.ts || Date.now())}`;
                return (
                  <div key={noticeKey} style={{ border: "1px solid #fecaca", borderRadius: 8, padding: "8px 10px", background: "#fff1f2" }}>
                    <div><b>{studentNameById(notice.studentId)}</b> · {notice.label}</div>
                    <Space size={6} wrap>
                      <Tag color={isSevere(notice.severity) ? "error" : "warning"}>{severityText(notice.severity)}</Tag>
                      <Text type="secondary">概率: {formatProbability(notice.probability)}</Text>
                      <Text type="secondary">时间: {formatTs(notice.ts)}</Text>
                    </Space>
                  </div>
                );
              })}
            </div>
            {/* 
            <Title level={5} style={{ margin: "8px 0 0" }}>异常证据</Title>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {evidences.length === 0 && <Text type="secondary">暂无证据</Text>}
              {evidences.filter((ev) => ev && typeof ev === "object").map((ev, idx) => (
                <div key={ev.evidenceId || `${ev.studentId || "x"}-${idx}`} style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: "8px 10px", background: "#fff" }}>
                  <div style={{ fontWeight: 600 }}>{ev.studentName || studentNameById(ev.studentId)}</div>
                  <div style={{ marginTop: 4 }}>
                    <Tag color={isSevere(ev.severity) ? "error" : "warning"}>{severityText(ev.severity)}</Tag>
                    <Tag>{ev.anomalyLabel || "unknown"}</Tag>
                    <Tag>{(ev.mediaExt || "gif").toUpperCase()}</Tag>
                  </div>
                  <Text type="secondary">时间：{formatTs(ev.anomalyTsMs || ev.anomalyAt)}</Text>
                  <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
                    <Button size="small" loading={mediaLoadingId === `${ev.evidenceId}preview`} onClick={() => openEvidence(ev, "preview")}>预览</Button>
                    <Button size="small" loading={mediaLoadingId === `${ev.evidenceId}download`} onClick={() => openEvidence(ev, "download")}>下载</Button>
                  </div>
                </div>
              ))}
            </div> */}

          </div>
        </Card>
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
    <Card size="small" style={{ borderRadius: 10, background: "rgba(255,255,255,0.55)" }} styles={{ body: { padding: 10 } }}>
      <div style={{ width: "100%", aspectRatio: "16 / 9", background: "#111", borderRadius: 8, overflow: "hidden" }}>
        <video ref={videoRef} autoPlay playsInline muted style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      </div>
      <div style={{ marginTop: 8, fontWeight: 600 }}>{student.studentName}</div>
    </Card>
  );
}