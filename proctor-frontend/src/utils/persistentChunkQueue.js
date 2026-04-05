const DB_NAME = "proctor-video-chunks";
const DB_VERSION = 1;
const STORE_NAME = "chunks";
const DEBUG_STORAGE_KEY = "proctor.chunk.log";
const DEBUG_BUFFER_KEY = "proctor.chunk.log.buffer";
const DEBUG_BUFFER_MAX_LINES = 600;

let dbPromise = null;

function installChunkLogExportHelpers() {
  if (typeof window === "undefined" || window.__proctorChunkLogHelpersInstalled) {
    return;
  }
  window.__proctorChunkLogHelpersInstalled = true;

  window.__downloadProctorChunkLog = () => {
    const text = window.localStorage?.getItem(DEBUG_BUFFER_KEY) || "";
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `proctor-chunk-log-${stamp}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
  };

  window.__clearProctorChunkLog = () => {
    window.localStorage?.removeItem(DEBUG_BUFFER_KEY);
  };
}

function persistChunkLogLine(line) {
  try {
    const raw = window.localStorage?.getItem(DEBUG_BUFFER_KEY) || "";
    const lines = raw ? raw.split("\n").filter(Boolean) : [];
    lines.push(line);
    if (lines.length > DEBUG_BUFFER_MAX_LINES) {
      lines.splice(0, lines.length - DEBUG_BUFFER_MAX_LINES);
    }
    window.localStorage?.setItem(DEBUG_BUFFER_KEY, `${lines.join("\n")}\n`);
  } catch {
    // localStorage 不可用时直接退回控制台日志
  }
}

function chunkLog(sessionKey, message, extra = null) {
  installChunkLogExportHelpers();
  try {
    if (window.localStorage?.getItem(DEBUG_STORAGE_KEY) !== "1") {
      return;
    }
  } catch {
    return;
  }
  const line = extra
    ? `${new Date().toISOString()} [chunk-queue] ${sessionKey} ${message} ${JSON.stringify(extra)}`
    : `${new Date().toISOString()} [chunk-queue] ${sessionKey} ${message}`;
  persistChunkLogLine(line);
  if (extra) {
    console.info("[chunk-queue]", sessionKey, message, extra);
    return;
  }
  console.info("[chunk-queue]", sessionKey, message);
}

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (!window.indexedDB) {
      reject(new Error("IndexedDB is not available"));
      return;
    }
    const req = window.indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error || new Error("failed to open IndexedDB"));
    req.onupgradeneeded = () => {
      const db = req.result;
      if (db.objectStoreNames.contains(STORE_NAME)) {
        return;
      }
      const store = db.createObjectStore(STORE_NAME, { keyPath: "chunkId" });
      store.createIndex("sessionKey", "sessionKey", { unique: false });
      store.createIndex("createdAt", "createdAt", { unique: false });
    };
    req.onsuccess = () => resolve(req.result);
  });
  return dbPromise;
}

async function withStore(mode, handler) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, mode);
    const store = tx.objectStore(STORE_NAME);
    let result;
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error || new Error("IndexedDB transaction failed"));
    tx.onabort = () => reject(tx.error || new Error("IndexedDB transaction aborted"));
    try {
      result = handler(store);
    } catch (error) {
      reject(error);
    }
  });
}

async function putChunk(record) {
  return withStore("readwrite", (store) => {
    store.put(record);
  });
}

async function deleteChunk(chunkId) {
  return withStore("readwrite", (store) => {
    store.delete(chunkId);
  });
}

async function patchChunk(chunkId, patch) {
  return withStore("readwrite", (store) => {
    const req = store.get(chunkId);
    req.onsuccess = () => {
      if (!req.result) return;
      store.put({ ...req.result, ...patch });
    };
  });
}

async function listChunks(sessionKey) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const index = store.index("sessionKey");
    const req = index.getAll(sessionKey);
    req.onerror = () => reject(req.error || new Error("failed to load local chunks"));
    req.onsuccess = () => {
      const items = Array.isArray(req.result) ? req.result : [];
      items.sort((a, b) => {
        const seqGap = Number(a.seq || 0) - Number(b.seq || 0);
        if (seqGap !== 0) return seqGap;
        return Number(a.chunkStartAtMs || 0) - Number(b.chunkStartAtMs || 0);
      });
      resolve(items);
    };
  });
}

function nextRetryDelayMs(retryCount) {
  const safeRetry = Math.max(0, Number(retryCount || 0));
  return Math.min(30_000, 1_000 * (2 ** Math.min(safeRetry, 5)));
}

export function createPersistentChunkQueue({
  api,
  apiPath,
  sessionKey,
  onServerEnded,
  onQueueError,
}) {
  let stopped = false;
  let flushing = false;
  let timerId = null;

  const cleanupTimer = () => {
    if (timerId) {
      window.clearTimeout(timerId);
      timerId = null;
    }
  };

  const scheduleFlush = (delayMs = 1_500) => {
    if (stopped) return;
    cleanupTimer();
    timerId = window.setTimeout(() => {
      flush().catch((error) => {
        onQueueError?.(error);
      });
    }, delayMs);
  };

  const flush = async () => {
    if (stopped || flushing) return;
    if (!navigator.onLine) {
      chunkLog(sessionKey, "skip flush because browser is offline");
      scheduleFlush(3_000);
      return;
    }

    flushing = true;
    try {
      const chunks = await listChunks(sessionKey);
      chunkLog(sessionKey, "flush started", { pending: chunks.length, apiPath });
      for (const chunk of chunks) {
        if (stopped) break;
        if ((chunk.nextRetryAt || 0) > Date.now()) continue;

        const fd = new FormData();
        fd.append("video", chunk.blob, chunk.fileName || "chunk.webm");
        fd.append("chunkStartAtMs", String(chunk.chunkStartAtMs));
        fd.append("chunkEndAtMs", String(chunk.chunkEndAtMs));
        fd.append("chunkId", chunk.chunkId);
        fd.append("chunkSeq", String(chunk.seq || 0));

        try {
          const resp = await api.post(apiPath, fd);
          if (!(resp?.data?.ok)) {
            throw new Error(resp?.data?.msg || "chunk upload failed");
          }

          await deleteChunk(chunk.chunkId);
          chunkLog(sessionKey, "chunk uploaded", {
            chunkId: chunk.chunkId,
            seq: chunk.seq,
            bytes: chunk.blob?.size || 0,
            ended: Boolean(resp.data?.ended),
            deduped: Boolean(resp.data?.deduped),
          });
          if (resp.data?.ended) {
            onServerEnded?.(resp.data);
          }
        } catch (error) {
          const retryCount = Number(chunk.retryCount || 0) + 1;
          await patchChunk(chunk.chunkId, {
            retryCount,
            lastError: error?.message || "chunk upload failed",
            nextRetryAt: Date.now() + nextRetryDelayMs(retryCount),
          });
          chunkLog(sessionKey, "chunk upload failed", {
            chunkId: chunk.chunkId,
            seq: chunk.seq,
            retryCount,
            error: error?.message || "chunk upload failed",
          });
          break;
        }
      }
    } finally {
      flushing = false;
      scheduleFlush();
    }
  };

  const onOnline = () => {
    flush().catch((error) => {
      onQueueError?.(error);
    });
  };

  const start = () => {
    stopped = false;
    window.addEventListener("online", onOnline);
    chunkLog(sessionKey, "queue started");
    scheduleFlush(0);
  };

  const stop = () => {
    stopped = true;
    cleanupTimer();
    window.removeEventListener("online", onOnline);
    chunkLog(sessionKey, "queue stopped");
  };

  const flushNow = async () => {
    await flush();
  };

  const enqueue = async ({ chunkId, seq, blob, mimeType, chunkStartAtMs, chunkEndAtMs }) => {
    await putChunk({
      chunkId,
      sessionKey,
      seq,
      blob,
      mimeType: mimeType || blob?.type || "video/webm",
      chunkStartAtMs,
      chunkEndAtMs,
      nextRetryAt: Date.now(),
      retryCount: 0,
      createdAt: Date.now(),
      fileName: "chunk.webm",
    });
    chunkLog(sessionKey, "chunk enqueued", {
      chunkId,
      seq,
      bytes: blob?.size || 0,
      mimeType: mimeType || blob?.type || "video/webm",
      chunkStartAtMs,
      chunkEndAtMs,
    });
    scheduleFlush(0);
  };

  return {
    start,
    stop,
    enqueue,
    flushNow,
  };
}
