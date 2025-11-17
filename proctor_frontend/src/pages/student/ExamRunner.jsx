// src/pages/student/ExamRunner.jsx
import { useEffect, useRef, useState } from "react";

export default function ExamRunner() {
  const videoRef = useRef(null);
  const [msg, setMsg] = useState("正在打开摄像头...");

  useEffect(() => {
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720, facingMode: "user" }, audio: false });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          setMsg("");
        }
      } catch (e) {
        setMsg("无法打开摄像头：" + e.message);
      }
    })();
    return () => {
      const s = videoRef.current?.srcObject;
      s?.getTracks?.().forEach(t => t.stop());
    };
  }, []);

  return (
    <div className="card">
      <h2>考试运行（摄像头测试）</h2>
      <div className="exam-video-wrap">
        <video ref={videoRef} playsInline muted className="exam-video" />
      </div>
      {msg && <div className="msg">{msg}</div>}
      {/* 后续：在这里周期抓帧调用 /api/student/verify 实时验证；或发 WebRTC 给教师端 */}
    </div>
  );
}
