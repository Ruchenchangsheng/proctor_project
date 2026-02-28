// src/pages/student/ExamRunner.jsx
import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../../apiClient";
import { createStomp } from "../../stomp";
import { useAuthStore } from "../../store/auth";

export default function ExamRunner() {
  const { sessionId } = useParams();
  const me = useAuthStore((s) => s.me);
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const stompRef = useRef(null);
  const peersRef = useRef(new Map());
  const joinTimerRef = useRef(null);
  const roomIdRef = useRef(null);
  const aiTimerRef = useRef(null);
  const aiUploadingRef = useRef(false);
  const aiCanvasRef = useRef(null);

  const [msg, setMsg] = useState("正在进入考试房间...");
  const [room, setRoom] = useState(null);
  const studentSenderId = me?.studentId || me?.userId || me?.id;

  function publishSignal(payload) {
    const client = stompRef.current;
    const examRoomId = roomIdRef.current;
    if (!client?.connected || !examRoomId) return;
    client.publish({ destination: "/app/exam-room.signal", body: JSON.stringify({ roomId: examRoomId, ...payload }) });
  }


  async function uploadAiFrame() {
    if (aiUploadingRef.current) return;
    const video = videoRef.current;
    if (!video || video.readyState < 2) return;
    const canvas = aiCanvasRef.current || document.createElement("canvas");
    aiCanvasRef.current = canvas;
    const targetWidth = 320;
    const ratio = (video.videoHeight || 360) / (video.videoWidth || 640);
    const targetHeight = Math.max(180, Math.round(targetWidth * ratio));
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    aiUploadingRef.current = true;
    try {
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.45));
      if (!blob) return;
      const fd = new FormData();
      fd.append("photo", blob, "ai.jpg");
      const endpoint = sessionId ? `/student/exams/${sessionId}/frame` : `/student/current-room/frame`;
      await api.post(endpoint, fd);
    } catch {
      // ignore ai upload failures
    } finally {
      aiUploadingRef.current = false;
    }
  }

  function closePeer(teacherId) {
    const pc = peersRef.current.get(teacherId);
    if (pc) {
      pc.close();
      peersRef.current.delete(teacherId);
    }
  }

  function ensurePeer(teacherId) {
    if (peersRef.current.has(teacherId)) return peersRef.current.get(teacherId);
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });

    const stream = streamRef.current;
    if (stream) {
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));
    }

    pc.onicecandidate = (e) => {
      if (!e.candidate) return;
      publishSignal({
        type: "candidate",
        senderRole: "STUDENT",
        senderId: studentSenderId,
        targetId: teacherId,
        candidate: e.candidate,
      });
    };

    pc.onconnectionstatechange = () => {
      if (["failed", "closed", "disconnected"].includes(pc.connectionState)) {
        closePeer(teacherId);
      }
    };

    peersRef.current.set(teacherId, pc);
    return pc;
  }

  useEffect(() => {
    (async () => {
      try {
        if (!studentSenderId) {
          setMsg("无法识别当前考生身份，请重新登录");
          return;
        }

        if (!window.RTCPeerConnection) {
          setMsg("当前浏览器不支持实时音视频，请更换 Chrome/Edge 最新版");
          return;
        }

        const roomRes = sessionId ? await api.get(`/student/exams/${sessionId}/room`) : await api.get(`/student/current-room`);
        if (!roomRes.data?.hasRoom) {
          setMsg(roomRes.data?.msg || "当前没有可进入的考试房间");
          return;
        }
        setRoom(roomRes.data);
        roomIdRef.current = roomRes.data.examRoomId;

        const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 960, height: 540, facingMode: "user" }, audio: false });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }

        const client = createStomp();
        stompRef.current = client;

        client.onConnect = () => {
          client.subscribe(`/topic/exam-room.${roomRes.data.examRoomId}`, async (frame) => {
            const signal = JSON.parse(frame.body || "{}");
            const myId = studentSenderId;
            if (signal.senderRole === "STUDENT" && signal.senderId === myId) return;
            if (signal.targetId && signal.targetId !== myId) return;

            if (signal.type === "teacher-online") {
              publishSignal({ type: "student-join", senderRole: "STUDENT", senderId: myId });
              return;
            }

            if (signal.type === "offer" && signal.senderRole === "TEACHER") {
              const teacherId = signal.senderId;
              const pc = ensurePeer(teacherId);
              await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
              const answer = await pc.createAnswer();
              await pc.setLocalDescription(answer);
              publishSignal({
                type: "answer",
                senderRole: "STUDENT",
                senderId: myId,
                targetId: teacherId,
                sdp: answer,
              });
              return;
            }

            if (signal.type === "candidate" && signal.senderRole === "TEACHER") {
              const teacherId = signal.senderId;
              const pc = ensurePeer(teacherId);
              if (signal.candidate) {
                await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
              }
            }
          });

          publishSignal({ type: "student-join", senderRole: "STUDENT", senderId: studentSenderId });
          joinTimerRef.current = setInterval(() => {
            publishSignal({ type: "student-join", senderRole: "STUDENT", senderId: studentSenderId });
          }, 3000);

          setMsg("已进入考试房间，正在向监考老师实时推流（AI检测进行中）...");
          aiTimerRef.current = setInterval(uploadAiFrame, 200);
        };

        client.activate();
      } catch (e) {
        setMsg("进入考试失败：" + e.message);
      }
    })();

    return () => {
      if (joinTimerRef.current) clearInterval(joinTimerRef.current);
      if (aiTimerRef.current) clearInterval(aiTimerRef.current);
      const client = stompRef.current;
      if (client?.connected) {
        publishSignal({ type: "student-leave", senderRole: "STUDENT", senderId: studentSenderId });
      }
      client?.deactivate();

      peersRef.current.forEach((pc) => pc.close());
      peersRef.current.clear();

      streamRef.current?.getTracks?.().forEach((t) => t.stop());
      streamRef.current = null;
      roomIdRef.current = null;
    };
  }, [sessionId, studentSenderId]);

  return (
    <div className="card">
      <h2>考试进行中（实时视频）</h2>
      {room && (
        <div style={{ marginBottom: 8 }}>
          考试：{room.examName} ｜ 房间：{room.roomId}（ID: {room.examRoomId}）
        </div>
      )}
      <div className="exam-video-wrap">
        <video ref={videoRef} playsInline muted autoPlay className="exam-video" />
      </div>
      {msg && <div className="msg">{msg}</div>}
    </div>
  );
}
