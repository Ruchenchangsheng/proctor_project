// StudentExamVerify 页面负责考试前的设备检查与身份核验串联，确保学生满足开考条件。
import { useEffect, useRef, useState } from "react";
import { api } from "../../apiClient";
import { useNavigate, useParams } from "react-router-dom";
import { Card, Button, Typography, Space, Result, Statistic, message, Modal, Select, Alert } from "antd";
import { CameraOutlined } from "@ant-design/icons";
import { clearExamMediaReady, loadExamMediaPreference, markExamMediaReady, saveExamMediaPreference } from "./examMediaGate";
import useCatalogTranslation from "../../i18n/useCatalogTranslation";

const { Title } = Typography;

export default function StudentExamVerify() {
  const { tr } = useCatalogTranslation();
  const { sessionId } = useParams();
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const [status, setStatus] = useState("idle");
  const [deadline, setDeadline] = useState(0);
  const [mediaReady, setMediaReady] = useState(false);
  const [deviceModalOpen, setDeviceModalOpen] = useState(false);
  const [mediaError, setMediaError] = useState("");
  const [videoDevices, setVideoDevices] = useState([]);
  const [audioDevices, setAudioDevices] = useState([]);
  const [selectedVideoDeviceId, setSelectedVideoDeviceId] = useState();
  const [selectedAudioDeviceId, setSelectedAudioDeviceId] = useState();
  const navigate = useNavigate();

  // 核验页只保留一条预览流；切设备或离开页面时都要主动释放硬件资源。
  const stopPreviewStream = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  };

  // 负责把页面中的一段独立交互逻辑拆出来，避免主组件渲染区混入过多细节。
  // 跟读这个函数时，建议同时留意它依赖了哪些 state/ref，以及执行后会触发哪些界面刷新。
  const refreshDeviceChoices = async () => {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const nextVideoDevices = devices.filter((item) => item.kind === "videoinput");
    const nextAudioDevices = devices.filter((item) => item.kind === "audioinput");
    setVideoDevices(nextVideoDevices);
    setAudioDevices(nextAudioDevices);
    setSelectedVideoDeviceId((current) => current || nextVideoDevices[0]?.deviceId);
    setSelectedAudioDeviceId((current) => current || nextAudioDevices[0]?.deviceId);
  };

  // 先在考前页把摄像头和麦克风拿到手，避免进入正式考试页后才发现权限或设备不可用。
  const requestVerifyMedia = async (preferSelectedDevices = false) => {
    clearExamMediaReady(sessionId);
    stopPreviewStream();
    try {
      const savedPreference = loadExamMediaPreference(sessionId);
      const preferredVideoId = selectedVideoDeviceId || savedPreference?.videoDeviceId;
      const preferredAudioId = selectedAudioDeviceId || savedPreference?.audioDeviceId;
      const stream = await navigator.mediaDevices.getUserMedia({
        video: preferSelectedDevices && preferredVideoId
          ? { deviceId: { exact: preferredVideoId } }
          : { facingMode: "user" },
        audio: preferSelectedDevices && preferredAudioId
          ? {
              deviceId: { exact: preferredAudioId },
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
            }
          : {
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
      streamRef.current = stream;
      const actualVideoDeviceId = stream.getVideoTracks()[0]?.getSettings?.().deviceId || preferredVideoId || "";
      const actualAudioDeviceId = stream.getAudioTracks()[0]?.getSettings?.().deviceId || preferredAudioId || "";
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      await refreshDeviceChoices();
      setSelectedVideoDeviceId(actualVideoDeviceId || undefined);
      setSelectedAudioDeviceId(actualAudioDeviceId || undefined);
      saveExamMediaPreference(sessionId, {
        videoDeviceId: actualVideoDeviceId,
        audioDeviceId: actualAudioDeviceId,
      });
      setMediaError("");
      setDeviceModalOpen(false);
      setMediaReady(true);
      return true;
    } catch (e) {
      setMediaReady(false);
      await refreshDeviceChoices().catch(() => {});
      const name = e?.name || "";
      const nextMessage = name === "NotFoundError" || name === "DevicesNotFoundError"
        ? "未检测到可用的摄像头或麦克风。请接入设备后，选择要使用的摄像头和麦克风，再重新授权。"
        : "必须同时允许摄像头和麦克风权限，才能完成身份验证并进入考试。你也可以手动选择设备后重试。";
      setMediaError(nextMessage);
      setDeviceModalOpen(true);
      message.error(nextMessage);
      return false;
    }
  };

  // 负责把页面中的一段独立交互逻辑拆出来，避免主组件渲染区混入过多细节。
  // 跟读这个函数时，建议同时留意它依赖了哪些 state/ref，以及执行后会触发哪些界面刷新。
  const goExam = () => {
    if (sessionId) {
      navigate(`/student/exams/${sessionId}/run`);
      return;
    }
    navigate("/student/exam");
  };

  // 这个 effect 负责在依赖变化时同步加载数据或建立/释放副作用。
  // 阅读时可以重点看依赖数组、内部异步流程以及 return 清理逻辑三部分。
  useEffect(() => {
    (async () => {
      await refreshDeviceChoices().catch(() => {});
      await requestVerifyMedia(false);
    })();
    return () => {
      stopPreviewStream();
    };
  }, []);

  // 这个 effect 负责在依赖变化时同步加载数据或建立/释放副作用。
  // 阅读时可以重点看依赖数组、内部异步流程以及 return 清理逻辑三部分。
  useEffect(() => {
    // 验证成功后给用户一个短暂反馈，再自动跳到正式考试页。
    if (status !== "ok") return;
    const timer = window.setTimeout(() => {
      goExam();
    }, 3000);
    return () => window.clearTimeout(timer);
  }, [status, sessionId]);

  // 负责把页面中的一段独立交互逻辑拆出来，避免主组件渲染区混入过多细节。
  // 跟读这个函数时，建议同时留意它依赖了哪些 state/ref，以及执行后会触发哪些界面刷新。
  async function doVerify() {
    if (!videoRef.current) return;
    if (!mediaReady) {
      message.error("请先同意摄像头和麦克风权限，再开始身份验证");
      return;
    }
    setStatus("running");
    try {
      // 这里抓取当前预览画面的一帧交给后端做人脸 1:1 比对。
      const video = videoRef.current;
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth; canvas.height = video.videoHeight;
      canvas.getContext("2d").drawImage(video, 0, 0);
      const blob = await new Promise((res) => canvas.toBlob(res, "image/jpeg", 0.9));
      const fd = new FormData();
      fd.append("photo", blob, "verify.jpg");
      const r = await api.post("/student/verify", fd);
      if (r.data?.passed) {
        markExamMediaReady(sessionId);
        setStatus("ok");
        setDeadline(Date.now() + 3000);
      } else {
        setStatus("fail");
        message.error(r.data?.msg || "验证失败");
      }
    } catch (e) {
      setStatus("fail");
    }
  }

  return (
    <Card className="glass-effect app-student-verify">
      {status === "ok" ? (
        <Result
          status="success"
          title={tr("验证通过")}
          subTitle={
            <Statistic.Timer
              value={deadline}
              type="countdown"
              format={tr("s 秒后进入考试")}
              onFinish={goExam}
            />
          }
        />
      ) : (
        <Space orientation="vertical" align="center" style={{ width: "100%" }}>
          <Title level={4}>{tr("考试身份核验")}</Title>
          <video
            ref={videoRef}
            playsInline
            muted
            style={{ width: "100%", maxWidth: 480, borderRadius: 12, background: "#000" }}
          />
          <Button
            type="primary"
            size="large"
            icon={<CameraOutlined />}
            onClick={doVerify}
            disabled={!mediaReady}
            loading={status === "running"}
          >
            {tr("开始核验")}
          </Button>
          <Button onClick={() => setDeviceModalOpen(true)}>{tr("选择设备")}</Button>
        </Space>
      )}
      <Modal
        title={tr("摄像头与麦克风访问")}
        open={deviceModalOpen}
        onCancel={() => setDeviceModalOpen(false)}
        onOk={() => requestVerifyMedia(true)}
        okText={tr("重新授权并打开设备")}
        cancelText={tr("稍后再试")}
        destroyOnHidden
      >
        <Space direction="vertical" size={14} style={{ width: "100%" }}>
          <Alert type="warning" showIcon message={mediaError || tr("请先允许摄像头和麦克风访问。")} />
          <div>
            <div style={{ marginBottom: 6 }}>{tr("摄像头")}</div>
            <Select
              style={{ width: "100%" }}
              placeholder={tr("请选择摄像头")}
              value={selectedVideoDeviceId}
              onChange={setSelectedVideoDeviceId}
              options={videoDevices.map((item, index) => ({
                value: item.deviceId,
                label: item.label || `${tr("摄像头")} ${index + 1}`,
              }))}
            />
          </div>
          <div>
            <div style={{ marginBottom: 6 }}>{tr("麦克风")}</div>
            <Select
              style={{ width: "100%" }}
              placeholder={tr("请选择麦克风")}
              value={selectedAudioDeviceId}
              onChange={setSelectedAudioDeviceId}
              options={audioDevices.map((item, index) => ({
                value: item.deviceId,
                label: item.label || `${tr("麦克风")} ${index + 1}`,
              }))}
            />
          </div>
        </Space>
      </Modal>
    </Card>
  );
}
