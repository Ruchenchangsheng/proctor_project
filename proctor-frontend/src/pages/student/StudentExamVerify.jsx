import { useEffect, useRef, useState } from "react";
import { api } from "../../apiClient";
import { useNavigate, useParams } from "react-router-dom";

export default function StudentExamVerify() {
  const { sessionId } = useParams();
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  // const [msg, setMsg] = useState("请正对摄像头，点击开始验证。");
  const [msg, setMsg] = useState("Смотрите прямо в камеру и нажмите «Начать проверку»."); 
  const [status, setStatus] = useState("idle");
  const [countdown, setCountdown] = useState(5);
  const navigate = useNavigate();

  useEffect(() => {
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
      } catch (e) {
        setMsg("无法打开摄像头：" + e.message);
      }
    })();
    return () => {
      const s = videoRef.current?.srcObject;
      s?.getTracks?.().forEach((t) => t.stop());
    };
  }, []);

  useEffect(() => {
    if (status !== "ok") return;
    const timer = setInterval(() => setCountdown((c) => c - 1), 1000);
    const t2 = setTimeout(() => navigate(`/student/exams/${sessionId}/run`), 5000);
    return () => {
      clearInterval(timer);
      clearTimeout(t2);
    };
  }, [status, navigate, sessionId]);

  async function doVerify() {
    if (!videoRef.current) return;
    try {
      setStatus("running");
      setMsg("正在验证...");
      const video = videoRef.current;
      const canvas = canvasRef.current || document.createElement("canvas");
      canvasRef.current = canvas;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise((res) => canvas.toBlob(res, "image/jpeg", 0.9));

      const fd = new FormData();
      fd.append("photo", blob, "verify.jpg");
      const r = await api.post("/student/verify", fd);
      if (!r.data?.ok || !r.data?.passed) {
        setStatus("fail");
        setMsg(r.data?.msg || "验证未通过，请重试");
        return;
      }
      setStatus("ok");
      setMsg(`验证通过，${countdown}s 后进入考试`);
    } catch (e) {
      setStatus("fail");
      setMsg("验证失败：" + e.message);
    }
  }

  return (
    // <div className="card verify-page">
    //   <div className="verify-left">
    //     <video ref={videoRef} playsInline muted className="verify-video" />
    //   </div>
    //   <div className="verify-right">
    //     <h3>考试前人脸验证</h3>
    //     <button className="btn-primary" onClick={doVerify} disabled={status === "running"}>
    //       {status === "running" ? "验证中..." : "开始验证"}
    //     </button>
    //     <div className={`verify-msg ${status}`}>
    //       {msg}
    //       {status === "ok" && <div className="countdown">自动跳转：{countdown}s</div>}
    //     </div>
    //   </div>
    // </div>

<div className="card verify-page">
  <div className="verify-left">
    <video ref={videoRef} playsInline muted className="verify-video" />
  </div>
  <div className="verify-right">
    <h3>Проверка лица перед экзаменом</h3>
    <button className="btn-primary" onClick={doVerify} disabled={status === "running"}>
      {status === "running" ? "Идёт проверка..." : "Начать проверку"}
    </button>
    <div className={`verify-msg ${status}`}>
      {msg}
      {status === "ok" && <div className="countdown">Автопереход через: {countdown} с</div>}
    </div>
  </div>
</div>
  );
}