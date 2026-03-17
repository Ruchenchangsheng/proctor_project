// examMediaGate 负责记录学生是否已经完成摄像头和麦克风授权，避免考试页直接触发失败。
const EXAM_MEDIA_GATE_PREFIX = "exam-media-ready:";
const EXAM_MEDIA_PREF_PREFIX = "exam-media-pref:";

// 负责把页面中的一段独立交互逻辑拆出来，避免主组件渲染区混入过多细节。
// 跟读这个函数时，建议同时留意它依赖了哪些 state/ref，以及执行后会触发哪些界面刷新。
function buildGateKey(sessionId) {
  return `${EXAM_MEDIA_GATE_PREFIX}${sessionId || "generic"}`;
}

export function markExamMediaReady(sessionId) {
  sessionStorage.setItem(buildGateKey(sessionId), String(Date.now()));
}

export function hasExamMediaReady(sessionId) {
  return Boolean(sessionStorage.getItem(buildGateKey(sessionId)));
}

export function clearExamMediaReady(sessionId) {
  sessionStorage.removeItem(buildGateKey(sessionId));
}

// 负责把页面中的一段独立交互逻辑拆出来，避免主组件渲染区混入过多细节。
// 跟读这个函数时，建议同时留意它依赖了哪些 state/ref，以及执行后会触发哪些界面刷新。
function buildPrefKey(sessionId) {
  return `${EXAM_MEDIA_PREF_PREFIX}${sessionId || "generic"}`;
}

export function saveExamMediaPreference(sessionId, preference) {
  if (!preference || (!preference.videoDeviceId && !preference.audioDeviceId)) {
    sessionStorage.removeItem(buildPrefKey(sessionId));
    return;
  }
  sessionStorage.setItem(buildPrefKey(sessionId), JSON.stringify(preference));
}

export function loadExamMediaPreference(sessionId) {
  const raw = sessionStorage.getItem(buildPrefKey(sessionId));
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
