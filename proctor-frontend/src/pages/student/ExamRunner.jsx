// ExamRunner 是学生考试进行页，负责采集本地音视频、上传监考帧、发送 WebRTC 信令并处理考试退出。
import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../../apiClient";
import { createStomp } from "../../stomp";
import { useAuthStore } from "../../store/auth";
import { Button, Card, Typography, Badge, Space, Alert, Tag } from "antd";
import { clearExamMediaReady, hasExamMediaReady, loadExamMediaPreference } from "./examMediaGate";
import useCatalogTranslation from "../../i18n/useCatalogTranslation";
import { createPersistentChunkQueue } from "../../utils/persistentChunkQueue";

const { Text } = Typography;
const FRAME_UPLOAD_INTERVAL_MS = 250;
const FRAME_UPLOAD_MAX_EDGE = 640;
const FRAME_UPLOAD_JPEG_QUALITY = 0.68;

export default function ExamRunner() {
  const { tr } = useCatalogTranslation();
  const { sessionId } = useParams();
  const me = useAuthStore((s) => s.me);
  const navigate = useNavigate();

  const videoRef = useRef(null);

  const canvasRef = useRef(null);
  const localStreamRef = useRef(null);
  const stompRef = useRef(null);
  const peersRef = useRef(new Map());
  const roomSignalIdRef = useRef(0);
  const frameApiPathRef = useRef("");
  const uploadTimerRef = useRef(null);
  const uploadLoopStoppedRef = useRef(false);
  const heartbeatTimerRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const videoChunkApiPathRef = useRef("");
  const chunkQueueRef = useRef(null);
  const chunkQueueKeyRef = useRef("");
  const chunkSeqRef = useRef(0);
  const lastChunkTsRef = useRef(0);
  const uploadBusyRef = useRef(false);
  const normalExitRef = useRef(false);
  const exitingRef = useRef(false);

  const [room, setRoom] = useState(null);
  const [msg, setMsg] = useState("正在连接考场...");
  const [micEnabled, setMicEnabled] = useState(false);

  const studentSenderId = me?.studentId || me?.userId || me?.id;

  // 负责把输入数据整理成当前页面更容易消费的格式。
  // 跟读这个函数时，建议同时留意它依赖了哪些 state/ref，以及执行后会触发哪些界面刷新。
  const normalizeId = (value) => {
    if (value === null || value === undefined || value === "") return "";
    return String(value);
  }

  const currentRoomSignalId = (roomData) => Number(roomData?.examRoomId || roomData?.roomExamId || roomData?.id || 0);

  // 所有学生端实时消息都通过同一信令主题收发，消息体再区分目标教师或学生。
  const publishSignal = (examRoomSignalId, payload) => {
    const client = stompRef.current;
    if (!client?.connected) {
      console.warn("[student-exam] signal skipped because stomp is not connected", payload);
      return;
    }
    console.info("[student-exam] publish signal", { roomId: examRoomSignalId, ...payload });
    client.publish({
      destination: "/app/exam-room.signal",
      body: JSON.stringify({ roomId: Number(examRoomSignalId), ...payload }),
    });
  }

  // 负责切换界面状态或执行带副作用的收尾动作。
  // 跟读这个函数时，建议同时留意它依赖了哪些 state/ref，以及执行后会触发哪些界面刷新。
  const clearTimers = () => {
    uploadLoopStoppedRef.current = true;
    if (uploadTimerRef.current) {
      window.clearTimeout(uploadTimerRef.current);
      uploadTimerRef.current = null;
    }
    if (heartbeatTimerRef.current) {
      window.clearInterval(heartbeatTimerRef.current);
      heartbeatTimerRef.current = null;
    }
  };

  // 负责把页面中的一段独立交互逻辑拆出来，避免主组件渲染区混入过多细节。
  // 跟读这个函数时，建议同时留意它依赖了哪些 state/ref，以及执行后会触发哪些界面刷新。
  const teardownRealtimeResources = () => {
    // 考试退出时要同时关闭录制器、STOMP、WebRTC peer 和本地硬件流，防止资源泄漏。
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    mediaRecorderRef.current = null;
    const queue = chunkQueueRef.current;
    if (queue) {
      window.setTimeout(() => {
        queue.flushNow().catch(() => { }).finally(() => {
          queue.stop();
          if (chunkQueueRef.current === queue) {
            chunkQueueRef.current = null;
          }
        });
      }, 400);
    }

    stompRef.current?.deactivate();
    peersRef.current.forEach((pc) => pc.close());
    peersRef.current.clear();

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  };


  // 负责切换界面状态或执行带副作用的收尾动作。
  // 跟读这个函数时，建议同时留意它依赖了哪些 state/ref，以及执行后会触发哪些界面刷新。
  const closePeer = (peerId) => {
    const pc = peersRef.current.get(peerId);
    if (pc) {
      pc.close();
      peersRef.current.delete(peerId);
    }
  }

  // 负责把页面中的一段独立交互逻辑拆出来，避免主组件渲染区混入过多细节。
  // 跟读这个函数时，建议同时留意它依赖了哪些 state/ref，以及执行后会触发哪些界面刷新。
  const ensurePeer = (peerId, examRoomSignalId) => {
    if (peersRef.current.has(peerId)) {
      return peersRef.current.get(peerId);
    }

    // 一个教师对应一个 RTCPeerConnection，教师重新发起 offer 时复用已有连接。
    const pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
    console.info("[student-exam] create peer for teacher", { peerId, examRoomSignalId });

    const localStream = localStreamRef.current;
    if (localStream) {
      localStream.getTracks().forEach((track) => pc.addTrack(track, localStream));
    }

    pc.onicecandidate = (e) => {
      if (!e.candidate) return;
      publishSignal(examRoomSignalId, {
        type: "candidate",
        senderRole: "STUDENT",
        senderId: studentSenderId,
        targetId: peerId,
        candidate: e.candidate,
      });
    };

    pc.onconnectionstatechange = () => {
      console.info("[student-exam] peer connection state", { peerId, state: pc.connectionState });
      if (["failed", "closed", "disconnected"].includes(pc.connectionState)) {
        closePeer(peerId);
      }
    };

    peersRef.current.set(peerId, pc);
    return pc;
  };

  // 负责把页面中的一段独立交互逻辑拆出来，避免主组件渲染区混入过多细节。
  // 跟读这个函数时，建议同时留意它依赖了哪些 state/ref，以及执行后会触发哪些界面刷新。
  const exitExam = async (tip) => {
    if (exitingRef.current) return;
    exitingRef.current = true;
    normalExitRef.current = true;
    clearExamMediaReady(sessionId);

    clearTimers();
    setMsg(tip || "考试已结束");

    const examRoomSignalId = roomSignalIdRef.current;
    if (examRoomSignalId && studentSenderId) {
      publishSignal(examRoomSignalId, {
        type: "student-leave",
        senderRole: "STUDENT",
        senderId: studentSenderId,
      });
    }

    teardownRealtimeResources();
    window.setTimeout(() => navigate("/student/home"), 1200);
  };

  const buildChunkId = (seq) => {
    const rand = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID().replace(/-/g, "")
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
    return `${seq.toString(36)}-${rand}`;
  };

  const uploadChunkDirectly = async (apiPath, blob, chunkStartAtMs, chunkEndAtMs, chunkId, seq) => {
    const fd = new FormData();
    fd.append("video", blob, "chunk.webm");
    fd.append("chunkStartAtMs", String(chunkStartAtMs));
    fd.append("chunkEndAtMs", String(chunkEndAtMs));
    fd.append("chunkId", chunkId);
    fd.append("chunkSeq", String(seq));
    const resp = await api.post(apiPath, fd);
    if (resp?.data?.ended) {
      exitExam(resp.data?.msg || "考试已结束，系统已自动交卷");
    }
  };

  // 负责把页面中的一段独立交互逻辑拆出来，避免主组件渲染区混入过多细节。
  // 跟读这个函数时，建议同时留意它依赖了哪些 state/ref，以及执行后会触发哪些界面刷新。
  const uploadFrameOnce = async () => {
    if (uploadBusyRef.current) return;
    const video = videoRef.current;
    const apiPath = frameApiPathRef.current;
    if (!video || !apiPath || video.videoWidth <= 0 || video.videoHeight <= 0) return;

    uploadBusyRef.current = true;
    try {
      // 学生端把当前视频帧截图成 JPEG 上传；后端会同时做人脸巡检、异常检测和证据缓冲。
      const canvas = canvasRef.current || document.createElement("canvas");
      canvasRef.current = canvas;
      const scale = Math.min(1, FRAME_UPLOAD_MAX_EDGE / Math.max(video.videoWidth, video.videoHeight));
      canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
      canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", FRAME_UPLOAD_JPEG_QUALITY));
      if (!blob) return;

      const fd = new FormData();
      fd.append("photo", blob, "frame.jpg");
      fd.append("capturedAtMs", String(Date.now()));

      const resp = await api.post(apiPath, fd);
      if (resp?.data?.ended) {
        exitExam(resp.data?.msg || "考试已结束，系统已自动交卷");
      }

      // const resp = await api.post(apiPath, fd);
      // if (resp?.data?.ended) {
      //   setMsg(resp.data?.msg || "考试已结束，系统已自动交卷");
      //   if (uploadTimerRef.current) {
      //     window.clearInterval(uploadTimerRef.current);
      //     uploadTimerRef.current = null;
      //   }
      //   if (heartbeatTimerRef.current) {
      //     window.clearInterval(heartbeatTimerRef.current);
      //     heartbeatTimerRef.current = null;
      //   }
      //   const examRoomSignalId = roomSignalIdRef.current;
      //   if (examRoomSignalId && studentSenderId) {
      //     publishSignal(examRoomSignalId, {
      //       type: "student-leave",
      //       senderRole: "STUDENT",
      //       senderId: studentSenderId,
      //     });
      //   }
      //   window.setTimeout(() => navigate('/student/home'), 1200);
      // }

    } catch {
      // 忽略上传失败，下一轮重试
    } finally {
      uploadBusyRef.current = false;
    }
  };

  // 负责驱动一段带外部依赖的流程，例如权限申请、实时通信或轮询检查。
  // 跟读这个函数时，建议同时留意它依赖了哪些 state/ref，以及执行后会触发哪些界面刷新。
  const scheduleFrameUpload = () => {
    if (uploadTimerRef.current) return;
    uploadLoopStoppedRef.current = false;
    // 用 setTimeout 链而不是 setInterval，避免某次上传耗时过长导致并发堆积。
    const loop = async () => {
      if (uploadLoopStoppedRef.current) return;
      await uploadFrameOnce();
      if (uploadLoopStoppedRef.current) return;
      // 帧上传仅保留身份巡检和教师实时画面的轻量链路，不再追求高频上传。
      uploadTimerRef.current = window.setTimeout(loop, FRAME_UPLOAD_INTERVAL_MS);
    };
    uploadTimerRef.current = window.setTimeout(loop, 0);
  };


  // 负责驱动一段带外部依赖的流程，例如权限申请、实时通信或轮询检查。
  // 跟读这个函数时，建议同时留意它依赖了哪些 state/ref，以及执行后会触发哪些界面刷新。
  const startVideoRecording = (stream) => {
    if (!window.MediaRecorder || !stream) return;
    const apiPath = videoChunkApiPathRef.current;
    if (!apiPath) return;

    try {
      // 连续分片录制用于事后证据拼接，和逐帧截图是两条并行链路。
      const hasAudioTrack = stream.getAudioTracks().length > 0;
      const mimeCandidates = hasAudioTrack
        ? [
          "video/webm;codecs=vp9,opus",
          "video/webm;codecs=vp8,opus",
          "video/webm;codecs=h264,opus",
          "video/webm",
        ]
        : [
          "video/webm;codecs=vp9",
          "video/webm;codecs=vp8",
          "video/webm",
        ];
      const mimeType = mimeCandidates.find((candidate) => MediaRecorder.isTypeSupported(candidate)) || "";
      const options = {
        ...(mimeType ? { mimeType } : {}),
        videoBitsPerSecond: mimeType.includes("vp9") ? 1_200_000 : mimeType.includes("vp8") ? 1_500_000 : 1_200_000,
      };

      if (chunkQueueRef.current) {
        chunkQueueRef.current.stop();
        chunkQueueRef.current = null;
      }
      if (chunkQueueKeyRef.current) {
        try {
          chunkQueueRef.current = createPersistentChunkQueue({
            api,
            apiPath,
            sessionKey: chunkQueueKeyRef.current,
            onServerEnded: (data) => {
              if (data?.ended) {
                exitExam(data?.msg || "考试已结束，系统已自动交卷");
              }
            },
            onQueueError: (error) => {
              console.warn("[student-exam] persistent chunk queue error", error);
            },
          });
          chunkQueueRef.current.start();
        } catch (error) {
          console.warn("[student-exam] persistent chunk queue init failed", error);
          chunkQueueRef.current = null;
        }
      }

      const recorder = new MediaRecorder(stream, options);
      mediaRecorderRef.current = recorder;
      lastChunkTsRef.current = Date.now();
      chunkSeqRef.current = 0;

      recorder.ondataavailable = async (event) => {
        if (!event.data || event.data.size <= 0) return;
        const chunkEndAtMs = Date.now();
        const chunkStartAtMs = lastChunkTsRef.current || Math.max(0, chunkEndAtMs - 1000);
        lastChunkTsRef.current = chunkEndAtMs;
        const seq = ++chunkSeqRef.current;
        const chunkId = buildChunkId(seq);

        try {
          if (chunkQueueRef.current) {
            await chunkQueueRef.current.enqueue({
              chunkId,
              seq,
              blob: event.data,
              mimeType: event.data.type || mimeType || "video/webm",
              chunkStartAtMs,
              chunkEndAtMs,
            });
          } else {
            await uploadChunkDirectly(apiPath, event.data, chunkStartAtMs, chunkEndAtMs, chunkId, seq);
          }
        } catch {
          // 持久队列不可用时退回直传，确保录制链路至少还能工作。
          await uploadChunkDirectly(apiPath, event.data, chunkStartAtMs, chunkEndAtMs, chunkId, seq).catch(() => { });
        }
      };

      recorder.start(1000);
    } catch {
      // MediaRecorder 初始化失败则回退为仅帧上传
    }
  };

  // 负责驱动一段带外部依赖的流程，例如权限申请、实时通信或轮询检查。
  // 跟读这个函数时，建议同时留意它依赖了哪些 state/ref，以及执行后会触发哪些界面刷新。
  const requestExamMedia = async () => {
    const preference = loadExamMediaPreference(sessionId);
    const constraints = {
      video: preference?.videoDeviceId
        ? { deviceId: { exact: preference.videoDeviceId } }
        : true,
      audio: {
        ...(preference?.audioDeviceId ? { deviceId: { exact: preference.audioDeviceId } } : {}),
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    };
    try {
      // 正式考试页要求摄像头和麦克风都在线，否则教师端拿不到完整监考流。
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      const hasVideoTrack = stream.getVideoTracks().some((track) => track.readyState === "live");
      const hasAudioTrack = stream.getAudioTracks().some((track) => track.readyState === "live");
      if (!hasVideoTrack || !hasAudioTrack) {
        stream.getTracks().forEach((track) => track.stop());
        throw new Error("必须同时开启摄像头和麦克风才能进入考试");
      }
      setMicEnabled(true);
      return stream;
    } catch (error) {
      setMicEnabled(false);
      clearExamMediaReady(sessionId);
      const name = error?.name || "";
      if (name === "NotAllowedError" || name === "PermissionDeniedError") {
        throw new Error("必须同意调用摄像头和麦克风，否则无法进入考试");
      }
      if (name === "NotFoundError" || name === "DevicesNotFoundError") {
        throw new Error("未检测到可用的摄像头或麦克风，无法进入考试");
      }
      throw error instanceof Error ? error : new Error("必须同时开启摄像头和麦克风才能进入考试");
    }
  };

  // 负责驱动一段带外部依赖的流程，例如权限申请、实时通信或轮询检查。
  // 跟读这个函数时，建议同时留意它依赖了哪些 state/ref，以及执行后会触发哪些界面刷新。
  const checkExamHeartbeat = async () => {
    if (!sessionId) return;
    try {
      // 心跳接口让前端能在考试被后台结束、交卷或超时后及时退出页面。
      const resp = await api.get(`/student/exams/${sessionId}/heartbeat`);
      if (resp?.data?.ended) {
        exitExam(resp.data?.msg || "考试已结束");
      }
    } catch {
      // 心跳失败忽略，避免页面崩溃
    }
  };

  // 这个 effect 负责在依赖变化时同步加载数据或建立/释放副作用。
  // 阅读时可以重点看依赖数组、内部异步流程以及 return 清理逻辑三部分。
  useEffect(() => {
    // 这个 effect 串起整条考试主线：校验考前授权 -> 打开本地流 -> 获取考场 -> 建立实时连接。
    let active = true;

    (async () => {
      try {
        if (!hasExamMediaReady(sessionId)) {
          setMsg("请先在考前身份核验页完成摄像头和麦克风授权，再进入考试");
          navigate(sessionId ? `/student/exams/${sessionId}/verify` : "/student/verify", { replace: true });
          return;
        }

        if (!studentSenderId) {
          setMsg("无法识别当前学生身份，请重新登录");
          return;
        }

        if (!window.RTCPeerConnection) {
          setMsg("当前浏览器不支持实时音视频，请更换 Chrome/Edge 最新版");
          return;
        }
        if (!navigator.mediaDevices?.getUserMedia) {
          setMsg("当前浏览器不支持摄像头和麦克风访问");
          return;
        }
        const stream = await requestExamMedia();
        if (!active) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        const roomResp = sessionId
          ? await api.get(`/student/exams/${sessionId}/room`)
          : await api.get("/student/current-room");

        if (!active) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        const roomData = roomResp.data;
        if (!roomData?.hasRoom) {
          stream.getTracks().forEach((t) => t.stop());
          setMsg(roomData?.msg || "当前未分配考试房间");
          return;
        }

        const examRoomSignalId = currentRoomSignalId(roomData);
        if (!examRoomSignalId) {
          stream.getTracks().forEach((t) => t.stop());
          setMsg("缺少考场编号，无法建立监考连接");
          return;
        }
        roomSignalIdRef.current = examRoomSignalId;
        frameApiPathRef.current = sessionId ? `/student/exams/${sessionId}/frame` : "/student/current-room/frame";
        videoChunkApiPathRef.current = sessionId ? `/student/exams/${sessionId}/video-chunk` : "/student/current-room/video-chunk";
        chunkQueueKeyRef.current = sessionId
          ? `exam:${sessionId}:${studentSenderId}`
          : `room:${examRoomSignalId}:${studentSenderId}`;

        localStreamRef.current = stream;

        if (videoRef.current) videoRef.current.srcObject = stream;
        startVideoRecording(stream);
        scheduleFrameUpload();
        if (!heartbeatTimerRef.current) {
          heartbeatTimerRef.current = window.setInterval(checkExamHeartbeat, 1000);
        }
        setMsg("监控已开启，正在连接监考信令...");

        const client = createStomp();
        stompRef.current = client;
        client.onStompError = () => {
          console.error("[student-exam] stomp protocol error");
          setMsg("监考信令连接失败，请刷新页面后重试");
        };
        client.onWebSocketError = () => {
          console.error("[student-exam] websocket transport error");
          setMsg("实时监考连接异常，请检查网络后重试");
        };
        client.onWebSocketClose = () => {
          console.warn("[student-exam] websocket closed");
          if (!normalExitRef.current) {
            setMsg("实时监考连接已断开，请刷新页面后重试");
          }
        };

        client.onConnect = () => {
          console.info("[student-exam] stomp connected", { examRoomSignalId, studentSenderId });
          client.subscribe(`/topic/exam-room.${examRoomSignalId}`, async (frame) => {
            // 同一个主题里会混入 offer、answer、candidate 等消息，这里按类型分发给对应 peer。
            let signal = {};
            try {
              signal = JSON.parse(frame?.body || "{}");
            } catch {
              return;
            }
            console.info("[student-exam] receive signal", signal);

            const myId = normalizeId(studentSenderId);
            const senderId = normalizeId(signal.senderId);
            const targetId = normalizeId(signal.targetId);

            if (signal.senderRole === "STUDENT" && senderId === myId) return;
            if (targetId && targetId !== myId) return;


            try {
              if (signal.type === "offer" && signal.senderRole === "TEACHER") {
                const teacherId = Number(signal.senderId);
                const pc = ensurePeer(teacherId, examRoomSignalId);
                if (!signal.sdp) return;
                console.info("[student-exam] received offer", { teacherId });
                await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
                const answer = await pc.createAnswer();
                await pc.setLocalDescription(answer);
                publishSignal(examRoomSignalId, {
                  type: "answer",
                  senderRole: "STUDENT",
                  senderId: studentSenderId,
                  targetId: teacherId,
                  sdp: answer,
                });
              } else if (signal.type === "candidate" && signal.senderRole === "TEACHER") {
                const teacherId = Number(signal.senderId);
                const pc = peersRef.current.get(teacherId);
                if (!pc || !signal.candidate) return;
                console.info("[student-exam] received candidate", { teacherId });
                await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
              }
            } catch {
              // 忽略单条信令异常

            }
          });

          publishSignal(examRoomSignalId, {
            type: "student-join",
            senderRole: "STUDENT",
            senderId: studentSenderId,
          });
          setMsg("监控已开启，请开始答题");
        };

        client.activate();
      } catch (e) {
        setMsg(`初始化失败: ${e?.message || "未知错误"}`);
      }
    })();

    return () => {
      active = false;
      clearExamMediaReady(sessionId);

      clearTimers();

      // 非正常退出会额外通知后端，便于后续做异常离场判定或自动交卷。
      if (sessionId && !normalExitRef.current) {
        api.post(`/student/exams/${sessionId}/abnormal-exit`).catch(() => { });
      }

      const examRoomSignalId = roomSignalIdRef.current;
      if (examRoomSignalId && studentSenderId) {
        publishSignal(examRoomSignalId, {
          type: "student-leave",
          senderRole: "STUDENT",
          senderId: studentSenderId,
        });
      }
      teardownRealtimeResources();
    };
  }, [sessionId, studentSenderId, navigate]);

  return (
    <div className="app-exam-runner">
      <Card className="glass-effect" variant="borderless" style={{ borderRadius: 16 }}>
        <div className="app-exam-runner-toolbar">
          <Space orientation="vertical">
            <Button
              size="small"
              onClick={async () => {
                if (!sessionId) return;
                await api.post(`/student/exams/${sessionId}/submit`).catch(() => { });
                exitExam("已交卷并退出考试");
              }}
            >
              {tr("提前交卷")}
            </Button>
          </Space>
          <Space size={12}>
            <Tag color={micEnabled ? "success" : "warning"}>
              {micEnabled ? tr("麦克风已开启") : tr("麦克风未开启")}
            </Tag>
            <Badge status="processing" text={tr("AI 实时检测中")} />
          </Space>
        </div>

        <video ref={videoRef} playsInline muted autoPlay style={{ width: "100%", borderRadius: 12, background: "#000" }} />
        <Alert title={msg} type="info" showIcon style={{ marginTop: 20 }} />
        {!sessionId && <Text type="secondary">{tr("当前为通用考试入口（无 sessionId）")}</Text>}
      </Card>
    </div>
  );
}
