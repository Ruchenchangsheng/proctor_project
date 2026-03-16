import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../../apiClient";
import { createStomp } from "../../stomp";
import { useAuthStore } from "../../store/auth";
import { Button, Card, Typography, Badge, Space, Alert, Tag } from "antd";
import { clearExamMediaReady, hasExamMediaReady, loadExamMediaPreference } from "./examMediaGate";
import useCatalogTranslation from "../../i18n/useCatalogTranslation";

const { Text } = Typography;

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
  const lastChunkTsRef = useRef(0);
  const uploadBusyRef = useRef(false);
  const normalExitRef = useRef(false);
  const exitingRef = useRef(false);

  const [room, setRoom] = useState(null);
  const [msg, setMsg] = useState("正在连接考场...");
  const [micEnabled, setMicEnabled] = useState(false);

  const studentSenderId = me?.studentId || me?.userId || me?.id;

  const normalizeId = (value) => {
    if (value === null || value === undefined || value === "") return "";
    return String(value);
  }

  const currentRoomSignalId = (roomData) => Number(roomData?.examRoomId || roomData?.roomExamId || roomData?.id || 0);

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

  const teardownRealtimeResources = () => {

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    mediaRecorderRef.current = null;

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


  const closePeer = (peerId) => {
    const pc = peersRef.current.get(peerId);
    if (pc) {
      pc.close();
      peersRef.current.delete(peerId);
    }
  }

  const ensurePeer = (peerId, examRoomSignalId) => {
    if (peersRef.current.has(peerId)) {
      return peersRef.current.get(peerId);
    }

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

  const exitExam = (tip) => {
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

  const uploadFrameOnce = async () => {
    if (uploadBusyRef.current) return;
    const video = videoRef.current;
    const apiPath = frameApiPathRef.current;
    if (!video || !apiPath || video.videoWidth <= 0 || video.videoHeight <= 0) return;

    uploadBusyRef.current = true;
    try {
      const canvas = canvasRef.current || document.createElement("canvas");
      canvasRef.current = canvas;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.98));
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

  const scheduleFrameUpload = () => {
    if (uploadTimerRef.current) return;
    uploadLoopStoppedRef.current = false;
    const loop = async () => {
      if (uploadLoopStoppedRef.current) return;
      await uploadFrameOnce();
      if (uploadLoopStoppedRef.current) return;
      // 与异常模型 30fps 的训练口径对齐，这里固定按约 33ms 一次上传。
      uploadTimerRef.current = window.setTimeout(loop, 33);
    };
    uploadTimerRef.current = window.setTimeout(loop, 0);
  };


  const startVideoRecording = (stream) => {
    if (!window.MediaRecorder || !stream) return;
    const apiPath = videoChunkApiPathRef.current;
    if (!apiPath) return;

    try {
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
        videoBitsPerSecond: mimeType.includes("vp9") ? 6_000_000 : mimeType.includes("vp8") ? 4_000_000 : 2_500_000,
      };

      const recorder = new MediaRecorder(stream, options);
      mediaRecorderRef.current = recorder;
      lastChunkTsRef.current = Date.now();

      recorder.ondataavailable = async (event) => {
        if (!event.data || event.data.size <= 0) return;
        const chunkEndAtMs = Date.now();
        const chunkStartAtMs = lastChunkTsRef.current || Math.max(0, chunkEndAtMs - 1000);
        lastChunkTsRef.current = chunkEndAtMs;

        const fd = new FormData();
        fd.append("video", event.data, "chunk.webm");
        fd.append("chunkStartAtMs", String(chunkStartAtMs));
        fd.append("chunkEndAtMs", String(chunkEndAtMs));

        try {
          await api.post(apiPath, fd);
        } catch {
          // 视频分片失败不影响主流程
        }
      };

      recorder.start(1000);
    } catch {
      // MediaRecorder 初始化失败则回退为仅帧上传
    }
  };

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

  const checkExamHeartbeat = async () => {
    if (!sessionId) return;
    try {
      const resp = await api.get(`/student/exams/${sessionId}/heartbeat`);
      if (resp?.data?.ended) {
        exitExam(resp.data?.msg || "考试已结束");
      }
    } catch {
      // 心跳失败忽略，避免页面崩溃
    }
  };

  useEffect(() => {

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
    <div style={{ width: "100%", height: "calc(94vh - 24px)", margin: "0 auto", display: "grid", gap: 16, overflow: "hidden" }}>
      <Card className="glass-effect" variant="borderless" style={{ borderRadius: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 20 }}>
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
