const EXAM_MEDIA_GATE_PREFIX = "exam-media-ready:";
const EXAM_MEDIA_PREF_PREFIX = "exam-media-pref:";

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
