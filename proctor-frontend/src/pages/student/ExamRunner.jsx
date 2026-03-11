import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../../apiClient";
import { createStomp } from "../../stomp";
import { useAuthStore } from "../../store/auth";
import { Card, Typography, Badge, Space, Alert, Tag } from "antd";
import { VideoCameraOutlined } from "@ant-design/icons";

const { Title, Text } = Typography;

export default function ExamRunner() {
  const { sessionId } = useParams();
  const me = useAuthStore((s) => s.me);

  const videoRef = useRef(null);

  const canvasRef = useRef(null);
  const localStreamRef = useRef(null);
  const stompRef = useRef(null);
  const peersRef = useRef(new Map());
  const roomSignalIdRef = useRef(0);
  const frameApiPathRef = useRef("");
  const uploadTimerRef = useRef(null);
  const uploadBusyRef = useRef(false);

  const [room, setRoom] = useState(null);
  const [msg, setMsg] = useState("正在连接考场...");

  const studentSenderId = me?.studentId || me?.userId || me?.id;

  function normalizeId(value) {
    if (value === null || value === undefined || value === "") return "";
    return String(value);
  }

  function currentRoomSignalId(roomData) {
    return Number(roomData?.examRoomId || roomData?.roomExamId || roomData?.id || 0);
  }

  function publishSignal(examRoomSignalId, payload) {
    const client = stompRef.current;
    if (!client?.connected) return;
    client.publish({
      destination: "/app/exam-room.signal",
      body: JSON.stringify({ roomId: Number(examRoomSignalId), ...payload }),
    });
  }

  function closePeer(peerId) {
    const pc = peersRef.current.get(peerId);
    if (pc) {
      pc.close();
      peersRef.current.delete(peerId);
    }
  }

  function ensurePeer(peerId, examRoomSignalId) {
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
  }

  async function uploadFrameOnce() {
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
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.7));
      if (!blob) return;

      const fd = new FormData();
      fd.append("photo", blob, "frame.jpg");
      await api.post(apiPath, fd);
    } catch {
      // 忽略上传失败，下一轮重试
    } finally {
      uploadBusyRef.current = false;
    }
  }

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

        const roomResp = sessionId
          ? await api.get(`/student/exams/${sessionId}/room`)
          : await api.get("/student/current-room");

        if (!active) return;
        const roomData = roomResp.data;
        if (!roomData?.hasRoom) {
          setMsg(roomData?.msg || "当前未分配考试房间");
          return;
        }
        setRoom(roomData);

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
            const signal = JSON.parse(frame.body || "{}");
            const myId = normalizeId(studentSenderId);
            const senderId = normalizeId(signal.senderId);
            const targetId = normalizeId(signal.targetId);

            if (signal.senderRole === "STUDENT" && senderId === myId) return;
            if (targetId && targetId !== myId) return;

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
              return;
            }

            if (signal.type === "candidate" && signal.senderRole === "TEACHER") {
              const teacherId = Number(signal.senderId);
              const pc = peersRef.current.get(teacherId);
              if (!pc || !signal.candidate) return;
              await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
            }
          });

          publishSignal(examRoomSignalId, {
            type: "student-join",
            senderRole: "STUDENT",
            senderId: studentSenderId,
          });
          uploadTimerRef.current = window.setInterval(uploadFrameOnce, 1200);
          setMsg("监控已开启，请开始答题");
        };

        client.activate();
      } catch (e) {
        setMsg("初始化失败: " + (e.message || "未知错误"));
      }
    })();

    return () => {
      active = false;
      if (uploadTimerRef.current) {
        window.clearInterval(uploadTimerRef.current);
        uploadTimerRef.current = null;
      }

      const examRoomSignalId = roomSignalIdRef.current;
      if (examRoomSignalId && studentSenderId) {
        publishSignal(examRoomSignalId, {
          type: "student-leave",
          senderRole: "STUDENT",
          senderId: studentSenderId,
        });
      }

      stompRef.current?.deactivate();
      peersRef.current.forEach((pc) => pc.close());
      peersRef.current.clear();

      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((t) => t.stop());
        localStreamRef.current = null;
      }
    };
  }, [sessionId, studentSenderId]);

  return (
    <div style={{ width: "100%", height: "calc(94vh - 24px)", margin: "0 auto", display: "grid", gap: 16, overflow: "hidden" }}>
    <Card className="glass-effect" variant="borderless" style={{ borderRadius: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", justifyContent: 'space-between', marginBottom: 20 }}>
        <Space  orientation="vertical">
        </Space>
        <Badge status="processing" text="AI 实时检测中" />
      </div>
      <video ref={videoRef} playsInline muted autoPlay style={{ width: '100%', borderRadius: 12, background: "#000" }} />
      <Alert message={msg} type="info" showIcon style={{ marginTop: 20 }} />
    </Card>
    </div>
  );
}