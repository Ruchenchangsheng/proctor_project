import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../../apiClient";
import { createStomp } from "../../stomp";
import { useAuthStore } from "../../store/auth";
import { Button, Card, Typography, Badge, Space, Alert, Tag } from "antd";

const { Text } = Typography;

export default function ExamRunner() {
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
  const heartbeatTimerRef = useRef(null);
  const uploadBusyRef = useRef(false);
  const normalExitRef = useRef(false);
  const exitingRef = useRef(false);

  const [room, setRoom] = useState(null);
  const [msg, setMsg] = useState("正在连接考场...");

  const studentSenderId = me?.studentId || me?.userId || me?.id;

  const normalizeId = (value) => {
    if (value === null || value === undefined || value === "") return "";
    return String(value);
  }

  const currentRoomSignalId = (roomData) => Number(roomData?.examRoomId || roomData?.roomExamId || roomData?.id || 0);

  const publishSignal = (examRoomSignalId, payload) => {
    const client = stompRef.current;
    if (!client?.connected) return;
    client.publish({
      destination: "/app/exam-room.signal",
      body: JSON.stringify({ roomId: Number(examRoomSignalId), ...payload }),
    });
  }

  const clearTimers = () => {
    if (uploadTimerRef.current) {
      window.clearInterval(uploadTimerRef.current);
      uploadTimerRef.current = null;
    }
    if (heartbeatTimerRef.current) {
      window.clearInterval(heartbeatTimerRef.current);
      heartbeatTimerRef.current = null;
    }
  };

  const teardownRealtimeResources = () => {
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
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
      if (!blob) return;

      const fd = new FormData();
      fd.append("photo", blob, "frame.jpg");

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

        if (!studentSenderId) {
          setMsg("无法识别当前学生身份，请重新登录");
          return;
        }

        if (!window.RTCPeerConnection) {
          setMsg("当前浏览器不支持实时音视频，请更换 Chrome/Edge 最新版");
          return;
        }
        if (!navigator.mediaDevices?.getUserMedia) {
          setMsg("当前浏览器不支持摄像头访问");
          return;
        }
        const roomResp = sessionId
          ? await api.get(`/student/exams/${sessionId}/room`)
          : await api.get("/student/current-room");

        if (!active) return;
        const roomData = roomResp.data;
        if (!roomData?.hasRoom) {
          setMsg(roomData?.msg || "当前未分配考试房间");
          return;
        }

        const examRoomSignalId = currentRoomSignalId(roomData);
        if (!examRoomSignalId) {
          setMsg("缺少考场编号，无法建立监考连接");
          return;
        }
        roomSignalIdRef.current = examRoomSignalId;
        frameApiPathRef.current = sessionId ? `/student/exams/${sessionId}/frame` : "/student/current-room/frame";

        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        if (!active) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        localStreamRef.current = stream;

        if (videoRef.current) videoRef.current.srcObject = stream;

        const client = createStomp();
        stompRef.current = client;

        client.onConnect = () => {
          client.subscribe(`/topic/exam-room.${examRoomSignalId}`, async (frame) => {

            let signal = {};
            try {
              signal = JSON.parse(frame?.body || "{}");
            } catch {
              return;
            }

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
          // x毫秒上传一帧
          uploadTimerRef.current = window.setInterval(uploadFrameOnce, 200);
          // 健康检测-是否异常退出等等
          heartbeatTimerRef.current = window.setInterval(checkExamHeartbeat, 1000);
          setMsg("监控已开启，请开始答题");
        };

        client.activate();
      } catch (e) {
        setMsg(`初始化失败: ${e?.message || "未知错误"}`);
      }
    })();

    return () => {
      active = false;

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
              提前交卷
            </Button>
          </Space>
          <Badge status="processing" text="AI 实时检测中" />
        </div>

        <video ref={videoRef} playsInline muted autoPlay style={{ width: "100%", borderRadius: 12, background: "#000" }} />
        <Alert title={msg} type="info" showIcon style={{ marginTop: 20 }} />
        {!sessionId && <Text type="secondary">当前为通用考试入口（无 sessionId）</Text>}
      </Card>
    </div>
  );
}