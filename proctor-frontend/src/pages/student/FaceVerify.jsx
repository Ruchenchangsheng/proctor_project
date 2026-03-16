// src/pages/student/FaceVerify.jsx
import { useEffect, useRef, useState } from "react";
import { api } from "../../apiClient";
import { useNavigate } from "react-router-dom";
import { clearExamMediaReady, markExamMediaReady } from "./examMediaGate";
import useCatalogTranslation from "../../i18n/useCatalogTranslation";

export default function FaceVerify() {
  const { tr } = useCatalogTranslation();
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [msg, setMsg] = useState(tr("请正对摄像头，保持光线充足；点击右侧“开始验证”。"));
  const [status, setStatus] = useState("idle"); // idle | running | ok | fail
  const [score, setScore] = useState(null);
  const [detScore, setDetScore] = useState(null);
  const [countdown, setCountdown] = useState(5);
  const [mediaReady, setMediaReady] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (status === "idle") {
      setMsg(tr("请正对摄像头，保持光线充足；点击右侧“开始验证”。"));
    }
  }, [status, tr]);

  useEffect(() => {
    (async () => {
      try {
        clearExamMediaReady();
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user" },
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
        const hasVideoTrack = stream.getVideoTracks().some((track) => track.readyState === "live");
        const hasAudioTrack = stream.getAudioTracks().some((track) => track.readyState === "live");
        if (!hasVideoTrack || !hasAudioTrack) {
          stream.getTracks().forEach((track) => track.stop());
          throw new Error("必须同时开启摄像头和麦克风才能进行身份验证");
        }
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        setMediaReady(true);
      } catch (e) {
        setMediaReady(false);
        setMsg(`${tr("必须同时同意摄像头和麦克风权限，否则无法验证并进入考试：")}${e.message}`);
      }
    })();
    return () => {
      const v = videoRef.current;
      const s = v?.srcObject;
      if (s && s.getTracks) s.getTracks().forEach(t => t.stop());
    };
  }, []);

  useEffect(() => {
    if (status === "ok") {
      const t = setInterval(() => setCountdown(c => c - 1), 1000);
      const t2 = setTimeout(() => navigate("/student/exam"), 5000);
      return () => { clearInterval(t); clearTimeout(t2); };
    }
  }, [status, navigate]);

  async function doVerify() {
    if (!videoRef.current) return;
    if (!mediaReady) {
      setStatus("fail");
      setMsg(tr("请先同意摄像头和麦克风权限，再开始验证。"));
      return;
    }
    try {
      setStatus("running");
      setMsg(tr("正在验证，请保持正脸…"));

      // 抓帧到 canvas → blob
      const video = videoRef.current;
      const canvas = canvasRef.current || document.createElement("canvas");
      canvasRef.current = canvas;
      const W = video.videoWidth, H = video.videoHeight;
      canvas.width = W; canvas.height = H;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(video, 0, 0, W, H);
      const blob = await new Promise(res => canvas.toBlob(res, "image/jpeg", 0.9));

      const fd = new FormData();
      fd.append("photo", blob, "frame.jpg");

      const r = await api.post("/student/verify", fd);
      const { ok, passed, score: s, detScore: d, threshold, minDetScore, msg: serverMsg } = r.data || {};
      setScore(typeof s === "number" ? s.toFixed(4) : null);
      setDetScore(typeof d === "number" ? d.toFixed(4) : null);

      if (!ok) {
        setStatus("fail");
        setMsg(serverMsg || tr("验证失败，请重试"));
        return;
      }
      if (passed) {
        markExamMediaReady();
        setStatus("ok");
        // setMsg(`验证通过（相似度 ${s?.toFixed(4)} ≥ 阈值 ${threshold}；det=${d?.toFixed(4)} ≥ ${minDetScore}）。将于 ${countdown} 秒后进入考试。`);
        setMsg(`验证通过。将于 ${countdown} 秒后进入考试。`);
      } else {
        setStatus("fail");
        // setMsg(serverMsg || `验证未通过（相似度 ${s?.toFixed(4)} < 阈值 ${threshold} 或质量不足），请调整后重试。`);
        setMsg(serverMsg || tr("验证未通过，请调整后重试。"));
      }
    } catch (e) {
      setStatus("fail");
      setMsg(`${tr("验证出错：")}${e.message}`);
    }
  }

  return (
    <div className="card verify-page">
      <div className="verify-left">
        <video ref={videoRef} playsInline muted className="verify-video" />
      </div>
      <div className="verify-right">
        <div style={{}}>
          {/* <h3>考前人脸验证</h3>
          <ol className="verify-tips">
            <li>请正对摄像头，保证光线均匀，不要逆光。</li>
            <li>确保只有你一个人在画面中。</li>
            <li>点击下方按钮开始验证。</li>
          </ol> */}

          
        

          <button className="btn-primary" onClick={doVerify} disabled={status === "running" || !mediaReady}>
            {status === "running" ? tr("验证中...") : tr("开始验证")}
          </button>

          <div className={`verify-msg ${status}`}>
            {msg}
            {(status === "ok") && <div className="countdown">{tr("自动跳转")}：{countdown}s</div>}
            {(score !== null || detScore !== null) && (
              <div className="meta">
                {score !== null && <span>{tr("相似度")}：{score}</span>}
                {detScore !== null && <span>det：{detScore}</span>}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
