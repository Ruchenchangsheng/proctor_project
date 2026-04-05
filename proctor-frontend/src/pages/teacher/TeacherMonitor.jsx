// TeacherMonitor 是教师实时监考页，负责接收学生音视频、展示异常告警并查看证据。
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { api } from "../../apiClient";
import { createStomp } from "../../stomp";
import { useAuthStore } from "../../store/auth";
import { Alert, Button, Card, Empty, Space, Tag, Typography, message } from "antd";
import i18n from "../../i18n/i18n";
import { toIntlLocale } from "../../i18n/catalog";
import useCatalogTranslation from "../../i18n/useCatalogTranslation";

const { Title, Text } = Typography;

export default function TeacherMonitor() {
  const { tr } = useCatalogTranslation();
  const { examRoomId } = useParams();
  const location = useLocation();
  const me = useAuthStore((s) => s.me);

  const [allStudents, setAllStudents] = useState([]);
  const [liveStudents, setLiveStudents] = useState([]);
  const [msg, setMsg] = useState("");
  const [mutedStudentIds, setMutedStudentIds] = useState([]);
  const [viewportWidth, setViewportWidth] = useState(() => (typeof window !== "undefined" ? window.innerWidth : 1440));
  const [viewportHeight, setViewportHeight] = useState(() => (typeof window !== "undefined" ? window.innerHeight : 900));

  const [liveNotices, setLiveNotices] = useState([]);
  const [evidences, setEvidences] = useState([]);
  const [mediaLoadingId, setMediaLoadingId] = useState("");
  const teacherSenderId = me?.teacherId || me?.userId || me?.id;

  const stompRef = useRef(null);
  const peersRef = useRef(new Map());
  const allStudentsRef = useRef([]);
  const lastOfferAttemptRef = useRef(new Map());
  const autoMutedStudentsRef = useRef(new Set());

  // 负责把输入数据整理成当前页面更容易消费的格式。
  // 跟读这个函数时，建议同时留意它依赖了哪些 state/ref，以及执行后会触发哪些界面刷新。
  function normalizeId(value) {
    if (value === null || value === undefined || value === "") return "";
    return String(value);
  }

  // 负责把页面中的一段独立交互逻辑拆出来，避免主组件渲染区混入过多细节。
  // 跟读这个函数时，建议同时留意它依赖了哪些 state/ref，以及执行后会触发哪些界面刷新。
  function studentNameById(studentId) {
    const hit = allStudentsRef.current.find((s) => Number(s.studentId) === Number(studentId));
    return hit?.studentName || `学生#${studentId}`;
  }

  // 负责把输入数据整理成当前页面更容易消费的格式。
  // 跟读这个函数时，建议同时留意它依赖了哪些 state/ref，以及执行后会触发哪些界面刷新。
  function formatTs(ts) {
    let d;
    if (typeof ts === "number") d = new Date(ts);
    else if (typeof ts === "string" && /^\d+$/.test(ts)) d = new Date(Number(ts));
    else d = new Date(ts || Date.now());
    if (Number.isNaN(d.getTime())) d = new Date();
    return d.toLocaleTimeString(toIntlLocale(i18n.language), { hour12: false });
  }

  // 负责把输入数据整理成当前页面更容易消费的格式。
  // 跟读这个函数时，建议同时留意它依赖了哪些 state/ref，以及执行后会触发哪些界面刷新。
  function formatProbability(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return "-";
    return n.toFixed(6);
  }

  // 负责把输入数据整理成当前页面更容易消费的格式。
  // 跟读这个函数时，建议同时留意它依赖了哪些 state/ref，以及执行后会触发哪些界面刷新。
  function mapCodeByLabel(label) {
    const m = {
      identity_face_missing: 1001,
      face_not_visible: 1001,
      identity_not_match: 1002,
      multiple_face_detected: 1003,
      multi_face: 1003,
      identity_check_error: 1099,
      abnormal_posture: 2001,
      look_left_right: 2002,
      abnormal_look_around: 2002,
      look_left: 2002,
      look_right: 2002,
      look_offscreen: 2002,
      head_down: 2003,
      abnormal_head_down: 2003,
      look_down: 2003,
      talking: 2004,
      other_person_present: 2005,
      other_limb_present: 2006,
      leave_seat: 2007,
    };
    return m[label] ?? 9000;
  }

  // 负责把页面中的一段独立交互逻辑拆出来，避免主组件渲染区混入过多细节。
  // 跟读这个函数时，建议同时留意它依赖了哪些 state/ref，以及执行后会触发哪些界面刷新。
  function violationTextByCode(code) {
    const c = Number(code);
    const m = {
      1001: "检测不到人脸",
      1002: "非本人",
      1003: "检测到多人脸",
      1099: "身份核验异常",
      2001: "姿态异常",
      2002: "视线偏离",
      2003: "低头",
      2004: "疑似说话",
      2005: "他人进入画面",
      2006: "画面出现额外肢体",
      2007: "离座",
      9000: "异常行为",
    };
    return m[c] || "异常行为";
  }

  // 教师端通过同一 STOMP 主题和学生协商 WebRTC，房间号就是双方的会合点。
  function publishSignal(payload) {
    const client = stompRef.current;
    if (!client?.connected) {
      console.warn("[teacher-monitor] signal skipped because stomp is not connected", payload);
      return;
    }
    console.info("[teacher-monitor] publish signal", { roomId: Number(examRoomId), ...payload });
    client.publish({
      destination: "/app/exam-room.signal",
      body: JSON.stringify({ roomId: Number(examRoomId), ...payload }),
    });
  }

  // 负责把页面中的一段独立交互逻辑拆出来，避免主组件渲染区混入过多细节。
  // 跟读这个函数时，建议同时留意它依赖了哪些 state/ref，以及执行后会触发哪些界面刷新。
  function combineStreamTracks(existingStream, incomingStream) {
    // 同一学生可能先到视频后到音频，这里把已到达的轨道合并成一条完整流。
    const tracks = new Map();
    existingStream?.getTracks().forEach((track) => {
      if (track.readyState === "live") {
        tracks.set(track.id, track);
      }
    });
    incomingStream?.getTracks().forEach((track) => {
      if (track.readyState === "live") {
        tracks.set(track.id, track);
      }
    });
    return new MediaStream(Array.from(tracks.values()));
  }

  // 负责把某个对象加载到当前页面上下文中，并更新相关显示状态。
  // 跟读这个函数时，建议同时留意它依赖了哪些 state/ref，以及执行后会触发哪些界面刷新。
  function updateLiveStream(studentId, stream) {
    setLiveStudents((prev) => {
      const student = allStudentsRef.current.find((s) => Number(s.studentId) === Number(studentId));
      if (!student) return prev;
      const existing = prev.find((x) => Number(x.studentId) === Number(studentId));
      const next = prev.filter((x) => Number(x.studentId) !== Number(studentId));
      next.push({
        ...student,
        stream: combineStreamTracks(existing?.stream, stream),
      });
      return next.sort((a, b) => Number(a.studentId) - Number(b.studentId));
    });
  }

  // 负责切换界面状态或执行带副作用的收尾动作。
  // 跟读这个函数时，建议同时留意它依赖了哪些 state/ref，以及执行后会触发哪些界面刷新。
  function toggleStudentAudio(studentId) {
    const normalizedStudentId = Number(studentId);
    setMutedStudentIds((current) => (
      current.some((id) => Number(id) === normalizedStudentId)
        ? current.filter((id) => Number(id) !== normalizedStudentId)
        : [...current, normalizedStudentId]
    ));
  }

  // 负责把某个对象加载到当前页面上下文中，并更新相关显示状态。
  // 跟读这个函数时，建议同时留意它依赖了哪些 state/ref，以及执行后会触发哪些界面刷新。
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

  // 负责把某个对象加载到当前页面上下文中，并更新相关显示状态。
  // 跟读这个函数时，建议同时留意它依赖了哪些 state/ref，以及执行后会触发哪些界面刷新。
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

  // 负责把某个对象加载到当前页面上下文中，并更新相关显示状态。
  // 跟读这个函数时，建议同时留意它依赖了哪些 state/ref，以及执行后会触发哪些界面刷新。
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
      const ext = item.mediaExt || (contentType.includes("webm") ? "webm" : "mp4");
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

  // 负责读取当前页面所需的数据，并把结果同步到 state 中。
  // 跟读这个函数时，建议同时留意它依赖了哪些 state/ref，以及执行后会触发哪些界面刷新。
  async function loadAlertsSnapshot() {
    try {
      // 告警快照作为实时订阅的兜底，避免教师刷新页面后丢失已经发生的异常。
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

  // 负责切换界面状态或执行带副作用的收尾动作。
  // 跟读这个函数时，建议同时留意它依赖了哪些 state/ref，以及执行后会触发哪些界面刷新。
  function removeLiveStream(studentId) {
    setLiveStudents((prev) => prev.filter((x) => Number(x.studentId) !== Number(studentId)));
  }

  // 负责把页面中的一段独立交互逻辑拆出来，避免主组件渲染区混入过多细节。
  // 跟读这个函数时，建议同时留意它依赖了哪些 state/ref，以及执行后会触发哪些界面刷新。
  function hasActiveRemoteVideo(peer) {
    if (!peer) return false;
    return peer.getReceivers().some((receiver) => receiver.track?.kind === "video" && receiver.track.readyState === "live");
  }

  // 负责切换界面状态或执行带副作用的收尾动作。
  // 跟读这个函数时，建议同时留意它依赖了哪些 state/ref，以及执行后会触发哪些界面刷新。
  function closePeer(studentId) {
    const pc = peersRef.current.get(studentId);
    if (pc) {
      pc.close();
      peersRef.current.delete(studentId);
    }
    removeLiveStream(studentId);
    setMutedStudentIds((current) => current.filter((id) => Number(id) !== Number(studentId)));
  }

  useEffect(() => {
    const syncViewportSize = () => {
      setViewportWidth(window.innerWidth || 1440);
      setViewportHeight(window.innerHeight || 900);
    };
    syncViewportSize();
    window.addEventListener("resize", syncViewportSize);
    return () => window.removeEventListener("resize", syncViewportSize);
  }, []);

  useEffect(() => {
    const liveStudentIds = new Set(liveStudents.map((student) => Number(student.studentId)));
    setMutedStudentIds((current) => {
      const next = current.filter((id) => liveStudentIds.has(Number(id)));
      liveStudentIds.forEach((studentId) => {
        // Safari/macOS 对带声音的远端流自动播放更严格，新接入学生先静音能避免黑屏。
        if (autoMutedStudentsRef.current.has(studentId)) return;
        autoMutedStudentsRef.current.add(studentId);
        next.push(studentId);
      });
      return next;
    });
  }, [liveStudents]);

  // 负责处理当前页面的提交型交互，并在成功后刷新界面状态。
  // 跟读这个函数时，建议同时留意它依赖了哪些 state/ref，以及执行后会触发哪些界面刷新。
  async function createOfferForStudent(studentId) {
    if (!allStudentsRef.current.some((s) => Number(s.studentId) === Number(studentId))) return;

    if (peersRef.current.has(studentId)) {
      const existing = peersRef.current.get(studentId);
      if (["connected", "connecting", "new"].includes(existing.connectionState)) return;
      if (existing.signalingState === "have-local-offer") return;
      closePeer(studentId);
    }

    const pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
    console.info("[teacher-monitor] create peer for student", { studentId, teacherSenderId });

    pc.addTransceiver("video", { direction: "recvonly" });
    pc.addTransceiver("audio", { direction: "recvonly" });

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
      console.info("[teacher-monitor] remote track received", {
        studentId,
        kind: e.track?.kind,
        streamId: stream?.id,
      });
      if (stream) updateLiveStream(studentId, stream);
    };

    pc.onconnectionstatechange = () => {
      console.info("[teacher-monitor] peer connection state", { studentId, state: pc.connectionState });
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

  // 负责把页面中的一段独立交互逻辑拆出来，避免主组件渲染区混入过多细节。
  // 跟读这个函数时，建议同时留意它依赖了哪些 state/ref，以及执行后会触发哪些界面刷新。
  async function offerForAllStudents() {
    const tasks = allStudentsRef.current.map((s) => createOfferForStudent(Number(s.studentId)));
    await Promise.allSettled(tasks);
  }

  // 这个 effect 负责在依赖变化时同步加载数据或建立/释放副作用。
  // 阅读时可以重点看依赖数组、内部异步流程以及 return 清理逻辑三部分。
  useEffect(() => {
    let reconnectTimer = null;
    let alertsTimer = null;
    (async () => {
      try {
        // 监考页的初始化顺序是：拉学生名单 -> 拉告警快照 -> 建立 STOMP -> 再发起 WebRTC。
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
        console.info("[teacher-monitor] roster loaded", students);

        const client = createStomp();
        stompRef.current = client;
        client.onStompError = () => {
          console.error("[teacher-monitor] stomp protocol error");
          setMsg("监考信令连接失败，请刷新页面后重试");
        };
        client.onWebSocketError = () => {
          console.error("[teacher-monitor] websocket transport error");
          setMsg("实时监考连接异常，请检查网络后重试");
        };
        client.onWebSocketClose = () => {
          console.warn("[teacher-monitor] websocket closed");
          setMsg("实时监考连接已断开，请刷新页面后重试");
        };

        client.onConnect = () => {
          console.info("[teacher-monitor] stomp connected", { examRoomId, teacherSenderId });
          client.subscribe(`/topic/exam-room.${examRoomId}`, async (frame) => {
            // 教师既接收学生加入/离开通知，也接收 answer/candidate 来完成 WebRTC 建链。
            let signal = {};
            try {
              signal = JSON.parse(frame.body || "{}");
            } catch {
              return;
            }
            console.info("[teacher-monitor] receive signal", signal);
            const myId = normalizeId(teacherSenderId);
            const senderId = normalizeId(signal.senderId);
            const targetId = normalizeId(signal.targetId);

            if (signal.senderRole === "TEACHER" && senderId === myId) return;
            if (targetId && targetId !== myId) return;

            if (signal.type === "student-join" && signal.senderRole === "STUDENT") {
              console.info("[teacher-monitor] student join", { studentId: signal.senderId });
              await createOfferForStudent(Number(signal.senderId));
              return;
            }

            if (signal.type === "answer" && signal.senderRole === "STUDENT") {
              const studentId = Number(signal.senderId);
              const pc = peersRef.current.get(studentId);
              if (!pc || !signal.sdp) return;
              if (pc.signalingState !== "have-local-offer") return;
              console.info("[teacher-monitor] received answer", { studentId });
              await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
              return;
            }

            if (signal.type === "candidate" && signal.senderRole === "STUDENT") {
              const studentId = Number(signal.senderId);
              const pc = peersRef.current.get(studentId);
              if (!pc || !signal.candidate) return;
              console.info("[teacher-monitor] received candidate", { studentId });
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
              const hasVideo = hasActiveRemoteVideo(peer);
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
      autoMutedStudentsRef.current.clear();
      setMutedStudentIds([]);
      setLiveStudents([]);
      allStudentsRef.current = [];
    };
  }, [examRoomId, teacherSenderId]);

  const isStackedLayout = viewportWidth < 1200;
  const sidePanelWidth = isStackedLayout ? Math.max(viewportWidth - 32, 320) : Math.min(Math.max(viewportWidth * 0.22, 300), 360);
  const mainPanelWidth = isStackedLayout
    ? Math.max(viewportWidth - 32, 320)
    : Math.max(viewportWidth - sidePanelWidth - 76, 360);
  const mainPanelHeight = isStackedLayout
    ? Math.max(Math.floor(viewportHeight * 0.5), 280)
    : Math.max(Math.floor(viewportHeight * 0.94) - 196, 280);
  const sidePanelHeight = isStackedLayout
    ? Math.max(Math.floor(viewportHeight * 0.34), 220)
    : Math.max(Math.floor(viewportHeight * 0.94) - 196, 220);

  const monitorGridConfig = useMemo(() => {
    const count = liveStudents.length;
    if (count <= 1) {
      return {
        columns: "minmax(0, 980px)",
        justifyContent: "center",
        density: "regular",
        gap: 10,
        singleView: true,
      };
    }

    const densityOrder = ["regular", "compact", "dense"];
    const densityGapMap = { regular: 10, compact: 8, dense: 6 };
    const densityChromeHeightMap = { regular: 88, compact: 74, dense: 64 };
    const maxColumns = Math.min(
      count,
      isStackedLayout
        ? 3
        : viewportWidth >= 2300
          ? 7
          : viewportWidth >= 1900
            ? 6
            : viewportWidth >= 1500
              ? 5
              : 4
    );

    for (const density of densityOrder) {
      const gap = densityGapMap[density];
      const chromeHeight = densityChromeHeightMap[density];
      for (let columns = 2; columns <= maxColumns; columns += 1) {
        const rows = Math.ceil(count / columns);
        const cellWidth = (mainPanelWidth - gap * (columns - 1)) / columns;
        const cardHeight = cellWidth * 0.75 + chromeHeight;
        const totalHeight = rows * cardHeight + gap * (rows - 1);
        if (totalHeight <= mainPanelHeight) {
          return {
            columns: `repeat(${columns}, minmax(0, 1fr))`,
            justifyContent: "stretch",
            density,
            gap,
            singleView: false,
          };
        }
      }
    }

    return {
      columns: `repeat(${maxColumns}, minmax(0, 1fr))`,
      justifyContent: "stretch",
      density: "dense",
      gap: 6,
      singleView: false,
    };
  }, [isStackedLayout, liveStudents.length, mainPanelHeight, mainPanelWidth, viewportWidth]);

  // 负责把页面中的一段独立交互逻辑拆出来，避免主组件渲染区混入过多细节。
  // 跟读这个函数时，建议同时留意它依赖了哪些 state/ref，以及执行后会触发哪些界面刷新。
  function isSevere(severity) {
    return String(severity || "WARNING").toUpperCase() === "SEVERE";
  }

  // 负责把页面中的一段独立交互逻辑拆出来，避免主组件渲染区混入过多细节。
  // 跟读这个函数时，建议同时留意它依赖了哪些 state/ref，以及执行后会触发哪些界面刷新。
  function severityText(severity) {
    return isSevere(severity) ? "严重" : "警告";
  }

  const enabledAudioCount = useMemo(() => (
    liveStudents.filter((student) => !mutedStudentIds.some((id) => Number(id) === Number(student.studentId))).length
  ), [liveStudents, mutedStudentIds]);
  const visibleNotices = useMemo(() => {
    const reservedHeight = 108;
    const itemHeight = isStackedLayout ? 74 : 88;
    const maxVisibleCount = Math.max(2, Math.floor((sidePanelHeight - reservedHeight) / itemHeight));
    return liveNotices.slice(0, maxVisibleCount);
  }, [isStackedLayout, liveNotices, sidePanelHeight]);
  const monitorBodyStyle = {
    display: "flex",
    flexDirection: isStackedLayout ? "column" : "row",
    gap: 12,
    minHeight: 0,
    flex: 1,
    minWidth: 0,
    overflow: isStackedLayout ? "visible" : "hidden",
    width: "100%",
  };
  const monitorMainStyle = {
    borderRadius: 16,
    minHeight: 0,
    minWidth: 0,
    maxWidth: "100%",
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
    flex: isStackedLayout ? "none" : "1 1 0",
    width: isStackedLayout ? "100%" : "auto",
  };
  const monitorGridStyle = {
    gridTemplateColumns: monitorGridConfig.columns,
    justifyContent: monitorGridConfig.justifyContent,
    gap: monitorGridConfig.gap,
    minWidth: 0,
    width: "100%",
    height: "100%",
    alignContent: "start",
    gridAutoRows: monitorGridConfig.singleView ? "minmax(0, 1fr)" : "max-content",
    alignItems: monitorGridConfig.singleView ? "stretch" : "start",
    overflow: "hidden",
  };
  const monitorSideStyle = {
    borderRadius: 16,
    minHeight: 0,
    minWidth: 0,
    maxWidth: "100%",
    overflow: "hidden",
    flex: isStackedLayout ? "none" : "0 0 clamp(300px, 22vw, 360px)",
    width: isStackedLayout ? "100%" : "auto",
    height: isStackedLayout ? "auto" : "100%",
  };

  return (
    <div className="app-monitor-page">
      <Card className="glass-effect" variant="borderless" style={{ borderRadius: 16, flex: "0 0 auto" }}>
        <Space orientation="vertical" size={8} style={{ width: "100%" }}>
          <Link to="/teacher/tasks/running">{tr("← 返回监考主页")}</Link>
          <div>
            <Text type="secondary">{tr("考试")}: {location.state?.examName || "-"} | {tr("考场")}: {location.state?.roomId || examRoomId}</Text>
          </div>
        </Space>
      </Card>

      <div className="app-monitor-body" style={monitorBodyStyle}>
        <Card
          className="glass-effect app-monitor-main"
          variant="borderless"
          style={monitorMainStyle}
          styles={{ body: { display: "flex", flexDirection: "column", minHeight: 0, height: "100%", overflow: "hidden" } }}
        >
          <div className={`app-monitor-grid is-${monitorGridConfig.density}`} style={monitorGridStyle}>
            {liveStudents.map((s) => (
              <VideoCard
                key={s.studentId}
                student={s}
                density={monitorGridConfig.density}
                isSingleView={monitorGridConfig.singleView}
                isAudioActive={!mutedStudentIds.some((id) => Number(id) === Number(s.studentId))}
                onToggleAudio={toggleStudentAudio}
              />
            ))}
            {liveStudents.length === 0 && <Empty description={tr("暂无学生进入考试实时视频")} style={{ padding: "40px 0" }} />}
          </div>
          {msg && <Alert style={{ marginTop: 12 }} type="error" showIcon message={msg} />}
        </Card>

        <Card
          className="glass-effect app-monitor-side"
          variant="borderless"
          style={monitorSideStyle}
          styles={{ body: { display: "flex", flexDirection: "column", minHeight: 0, height: "100%", overflow: "hidden" } }}
        >
          <div style={{ flex: "0 0 auto", borderBottom: "1px solid #e5e7eb", paddingBottom: 8, marginBottom: 8 }}>
            <Text>{tr("在线人数")}: {liveStudents.length} / {allStudents.length}</Text>
            <br />
            <Text type="secondary">
              {`${tr("已开启音频")}: ${enabledAudioCount} / ${liveStudents.length}${mutedStudentIds.length > 0 ? ` · ${tr("已关闭")}: ${mutedStudentIds.length}` : ""}`}
            </Text>
            <Title level={5} style={{ margin: 0 }}>{tr("异常状态")}</Title>
          </div>

          <div className="app-monitor-side-scroll" style={{ flex: "1 1 auto", minHeight: 0, overflow: "hidden", paddingRight: 0 }}>
            <Title level={5} style={{ margin: 0 }}>{tr("异常通知")}</Title>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {visibleNotices.length === 0 && <Text type="secondary">{tr("等待异常检测通知...")}</Text>}
              {visibleNotices.map((notice) => {
                const noticeKey = notice?.id || `${notice?.studentId || "x"}-${notice?.code || "unknown"}-${String(notice?.ts || Date.now())}`;
                return (
                  <div key={noticeKey} style={{ border: "1px solid #fecaca", borderRadius: 8, padding: isStackedLayout ? "6px 8px" : "8px 10px", background: "#fff1f2", overflow: "hidden" }}>
                    <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}><b>{studentNameById(notice.studentId)}</b> · {notice.label}</div>
                    <Space size={6} wrap>
                      <Tag color={isSevere(notice.severity) ? "error" : "warning"}>{severityText(notice.severity)}</Tag>
                      <Text type="secondary">{tr("概率")}: {formatProbability(notice.probability)}</Text>
                      <Text type="secondary">{tr("时间")}: {formatTs(notice.ts)}</Text>
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

// 负责把页面中的一段独立交互逻辑拆出来，避免主组件渲染区混入过多细节。
// 跟读这个函数时，建议同时留意它依赖了哪些 state/ref，以及执行后会触发哪些界面刷新。
function VideoCard({ student, density = "regular", isSingleView = false, isAudioActive, onToggleAudio }) {
  const { tr } = useCatalogTranslation();
  const videoRef = useRef(null);
  const audioContextRef = useRef(null);
  const audioTimerRef = useRef(null);
  const speakingMsRef = useRef(0);
  const silenceMsRef = useRef(0);
  const [speakingMs, setSpeakingMs] = useState(0);
  const [audioAvailable, setAudioAvailable] = useState(false);
  const [videoAspectRatio, setVideoAspectRatio] = useState("4 / 3");

  // 这个 effect 负责在依赖变化时同步加载数据或建立/释放副作用。
  // 阅读时可以重点看依赖数组、内部异步流程以及 return 清理逻辑三部分。
  useEffect(() => {
    // 视频元素只是展示层；真正的媒体流状态仍由父组件统一维护。
    const videoEl = videoRef.current;
    if (!videoEl) {
      return undefined;
    }
    videoEl.srcObject = student.stream || null;
    videoEl.muted = !isAudioActive;
    videoEl.volume = 1;
    const syncAspectRatio = () => {
      if (videoEl.videoWidth > 0 && videoEl.videoHeight > 0) {
        setVideoAspectRatio(`${videoEl.videoWidth} / ${videoEl.videoHeight}`);
      }
    };
    videoEl.addEventListener("loadedmetadata", syncAspectRatio);
    videoEl.addEventListener("resize", syncAspectRatio);
    if (student.stream) {
      const playPromise = videoEl.play();
      if (playPromise?.catch) {
        playPromise.catch(() => { });
      }
    }
    return () => {
      videoEl.removeEventListener("loadedmetadata", syncAspectRatio);
      videoEl.removeEventListener("resize", syncAspectRatio);
    };
  }, [isAudioActive, student.stream]);

  // 这个 effect 负责在依赖变化时同步加载数据或建立/释放副作用。
  // 阅读时可以重点看依赖数组、内部异步流程以及 return 清理逻辑三部分。
  useEffect(() => {
    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    const stream = student.stream;
    const audioTracks = stream?.getAudioTracks?.() || [];
    const hasAudio = audioTracks.some((track) => track.readyState === "live");

    setAudioAvailable(hasAudio);
    setSpeakingMs(0);
    speakingMsRef.current = 0;
    silenceMsRef.current = 0;

    if (!stream || !hasAudio || !AudioContextCtor) {
      return undefined;
    }

    // 用简单的 RMS 音量检测高亮“疑似说话”的学生，帮助教师快速聚焦风险画面。
    const ctx = new AudioContextCtor();
    const source = ctx.createMediaStreamSource(new MediaStream(audioTracks));
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.82;
    source.connect(analyser);
    audioContextRef.current = ctx;

    const data = new Uint8Array(analyser.fftSize);
    const sampleWindowMs = 120;
    const activeThreshold = 0.035;

    // 负责把页面中的一段独立交互逻辑拆出来，避免主组件渲染区混入过多细节。
    // 跟读这个函数时，建议同时留意它依赖了哪些 state/ref，以及执行后会触发哪些界面刷新。
    const tick = () => {
      analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i += 1) {
        const normalized = (data[i] - 128) / 128;
        sum += normalized * normalized;
      }
      const rms = Math.sqrt(sum / data.length);
      if (rms >= activeThreshold) {
        silenceMsRef.current = 0;
        speakingMsRef.current = Math.min(speakingMsRef.current + sampleWindowMs, 6000);
      } else {
        silenceMsRef.current += sampleWindowMs;
        if (silenceMsRef.current >= 360) {
          speakingMsRef.current = 0;
        }
      }
      setSpeakingMs(speakingMsRef.current);
    };

    ctx.resume().catch(() => { });
    audioTimerRef.current = window.setInterval(tick, sampleWindowMs);

    return () => {
      if (audioTimerRef.current) {
        window.clearInterval(audioTimerRef.current);
        audioTimerRef.current = null;
      }
      source.disconnect();
      analyser.disconnect();
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => { });
        audioContextRef.current = null;
      }
    };
  }, [student.stream]);

  const highlightStrength = Math.min(1, speakingMs / 3000);
  const isSpeaking = speakingMs >= 240;
  const cardShadow = isSpeaking
    ? `0 0 ${14 + Math.round(18 * highlightStrength)}px rgba(250, 173, 20, ${0.28 + highlightStrength * 0.32})`
    : "0 6px 16px rgba(15, 23, 42, 0.08)";
  const frameOutline = isSpeaking
    ? `0 0 0 ${2 + Math.round(highlightStrength * 3)}px rgba(250, 173, 20, ${0.3 + highlightStrength * 0.4})`
    : "0 0 0 1px rgba(148, 163, 184, 0.16)";
  const bodyPadding = density === "dense" ? 7 : density === "compact" ? 8 : 10;
  const metaGap = density === "dense" ? 6 : 8;
  const nameFontSize = density === "dense" ? 13 : 14;
  const buttonSize = density === "dense" ? "small" : "small";

  return (
    <Card
      size="small"
      className={`app-monitor-card is-${density}`}
      style={{
        borderRadius: 10,
        background: "rgba(255,255,255,0.55)",
        boxShadow: cardShadow,
        border: isSpeaking ? "1px solid rgba(250, 173, 20, 0.72)" : "1px solid rgba(226, 232, 240, 0.9)",
        transition: "box-shadow 160ms ease, border-color 160ms ease",
        alignSelf: isSingleView ? "stretch" : "start",
        justifySelf: isSingleView ? "center" : "stretch",
        width: "100%",
        maxWidth: isSingleView ? "min(100%, 980px)" : "100%",
        minWidth: 0,
        height: isSingleView ? "100%" : "auto",
        maxHeight: "100%",
        overflow: "hidden",
      }}
      styles={{ body: { padding: bodyPadding, minWidth: 0, minHeight: 0, height: "100%", overflow: "hidden", display: "flex", flexDirection: "column" } }}
    >
      <div
        style={{
          width: "100%",
          flex: isSingleView ? "1 1 auto" : "0 0 auto",
          minHeight: 0,
          aspectRatio: isSingleView ? undefined : videoAspectRatio,
          background: "#111",
          borderRadius: 8,
          overflow: "hidden",
          boxShadow: frameOutline,
          transition: "box-shadow 160ms ease",
        }}
      >
        <video ref={videoRef} autoPlay playsInline style={{ width: "100%", height: "100%", objectFit: "contain", background: "#111" }} />
      </div>
      <div style={{ marginTop: metaGap, fontWeight: 600, fontSize: nameFontSize, lineHeight: 1.3, overflowWrap: "anywhere" }}>{student.studentName}</div>
      <Space size={density === "dense" ? 6 : 8} wrap style={{ marginTop: metaGap }}>
        <Tag color={!audioAvailable ? "default" : isSpeaking ? "gold" : "blue"}>
          {!audioAvailable ? tr("无音频") : isSpeaking ? `${tr("说话中")} ${(speakingMs / 1000).toFixed(1)}s` : tr("环境安静")}
        </Tag>
        <Button size={buttonSize} type={isAudioActive ? "primary" : "default"} disabled={!audioAvailable} onClick={() => onToggleAudio(student.studentId)}>
          {isAudioActive ? tr("关闭声音") : tr("播放声音")}
        </Button>
      </Space>
    </Card>
  );
}
