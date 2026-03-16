package com.kovr.proctor.service;

import com.kovr.proctor.domain.entity.AnomalyClipTaskEntity;
import com.kovr.proctor.domain.entity.AnomalyEvidenceEntity;
import com.kovr.proctor.domain.entity.AnomalySegmentLinkEntity;
import com.kovr.proctor.domain.entity.RecordingSegmentEntity;
import com.kovr.proctor.infra.mapper.AnomalyClipTaskMapper;
import com.kovr.proctor.infra.mapper.AnomalyEvidenceMapper;
import com.kovr.proctor.infra.mapper.AnomalySegmentLinkMapper;
import com.kovr.proctor.infra.mapper.ExamSessionMapper;
import com.kovr.proctor.infra.mapper.RecordingSegmentMapper;
import com.kovr.proctor.infra.mapper.StudentMapper;
import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.stereotype.Service;

import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.BufferedOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.nio.file.StandardOpenOption;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.Deque;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Locale;
import java.util.UUID;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;

@Service
@RequiredArgsConstructor
@Slf4j
public class AnomalyEvidenceService {
    private static final DateTimeFormatter TS_FMT = DateTimeFormatter.ofPattern("yyyyMMddHHmmss");

    private final ConcurrentHashMap<String, Deque<FrameSnapshot>> frameBuffers = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, Deque<VideoChunkSnapshot>> videoChunkBuffers = new ConcurrentHashMap<>();
    private final BlockingQueue<String> clipTaskQueue = new LinkedBlockingQueue<>();
    private final ConcurrentHashMap<String, EvidenceRecord> evidences = new ConcurrentHashMap<>();
    private final AnomalyEvidenceMapper anomalyEvidenceMapper;
    private final RecordingSegmentMapper recordingSegmentMapper;
    private final AnomalyClipTaskMapper anomalyClipTaskMapper;
    private final AnomalySegmentLinkMapper anomalySegmentLinkMapper;
    private final ExamSessionMapper examSessionMapper;
    private final StudentMapper studentMapper;

    @Value("${anomaly.evidence.dir:./data/anomaly-evidence}")
    private String evidenceDir;

    @Value("${anomaly.evidence.frame-buffer-size:24}")
    private int frameBufferSize;

    @Value("${anomaly.evidence.max-frames-per-video:18}")
    private int maxFramesPerVideo;

    @Value("${anomaly.evidence.padding-before-ms:1000}")
    private long paddingBeforeMs;

    @Value("${anomaly.evidence.padding-after-ms:1000}")
    private long paddingAfterMs;

    @Value("${anomaly.evidence.clip-ready-delay-ms:1200}")
    private long clipReadyDelayMs;

    @Value("${anomaly.evidence.chunk-duration-ms:1000}")
    private long chunkDurationMs;

    @Value("${anomaly.evidence.clip-max-wait-ms:180000}")
    private long clipMaxWaitMs;

    @Value("${anomaly.evidence.video-format:mp4}")
    private String videoFormat;

    @Value("${anomaly.evidence.tmp-full-video-dir:tmp-full-videos}")
    private String tmpFullVideoDir;

    private volatile boolean clipWorkerRunning;
    private Thread clipWorkerThread;

    @PostConstruct
    void startClipWorker() {
        clipWorkerRunning = true;
        clipWorkerThread = new Thread(this::runClipWorker, "anomaly-clip-worker");
        clipWorkerThread.setDaemon(true);
        clipWorkerThread.start();
    }

    @PreDestroy
    void stopClipWorker() {
        clipWorkerRunning = false;
        if (clipWorkerThread != null) {
            clipWorkerThread.interrupt();
        }
    }

    public void bufferFrame(Long roomId, Long studentId, String mime, byte[] bytes, long tsMs) {
        if (roomId == null || studentId == null || bytes == null || bytes.length == 0) {
            return;
        }
        String key = roomId + ":" + studentId;
        Deque<FrameSnapshot> deque = frameBuffers.computeIfAbsent(key, k -> new ArrayDeque<>());
        synchronized (deque) {
            deque.addLast(new FrameSnapshot(tsMs, mime, bytes));
            while (deque.size() > frameBufferSize) {
                deque.removeFirst();
            }
        }
    }

    public void bufferVideoChunk(Long roomId,
                                 Long studentId,
                                 Long sessionId,
                                 Long schoolId,
                                 String mime,
                                 byte[] bytes,
                                 long startTsMs,
                                 long endTsMs) {
        if (roomId == null || studentId == null || bytes == null || bytes.length == 0) {
            return;
        }
        String key = roomId + ":" + studentId;
        long normalizedEnd = Math.max(endTsMs, startTsMs);
        StoragePathSpec storagePath = resolveStoragePath(studentId, sessionId, schoolId, null, null);
        Path recordDir = storagePath.recordingDir();
        try {
            Files.createDirectories(recordDir);
            String segmentId = UUID.randomUUID().toString().replace("-", "");
            String fileName = String.format(Locale.ROOT, "%d_%d_%s.webm", startTsMs, normalizedEnd, segmentId);
            Path chunkPath = recordDir.resolve(fileName);
            Files.write(chunkPath, bytes);

            Deque<VideoChunkSnapshot> deque = videoChunkBuffers.computeIfAbsent(key, k -> new ArrayDeque<>());
            synchronized (deque) {
                deque.addLast(new VideoChunkSnapshot(segmentId, startTsMs, normalizedEnd, mime, chunkPath.toAbsolutePath().toString()));
                while (deque.size() > frameBufferSize * 4L) {
                    deque.removeFirst();
                }
            }

            RecordingSegmentEntity entity = new RecordingSegmentEntity();
            entity.setSegmentId(segmentId);
            entity.setSessionId(sessionId);
            entity.setExamRoomId(roomId);
            entity.setStudentId(studentId);
            entity.setSchoolId(schoolId);
            entity.setChunkStartTsMs(startTsMs);
            entity.setChunkEndTsMs(normalizedEnd);
            entity.setFilePath(chunkPath.toAbsolutePath().toString());
            entity.setMediaType(mime == null ? "video/webm" : mime);
            recordingSegmentMapper.insert(entity);
        } catch (Exception ex) {
            log.warn("Failed to persist video chunk: roomId={}, studentId={}, err={}", roomId, studentId, ex.toString());
        }
    }

    public List<Map<String, Object>> captureEvidenceBatch(
            Long roomId,
            Long studentId,
            List<Map<String, Object>> events,
            Map<String, Object> session,
            String studentName,
            String invigilatorName,
            Long schoolId) {
        if (events == null || events.isEmpty()) {
            return List.of();
        }
        List<Map<String, Object>> out = new ArrayList<>();
        for (Map<String, Object> event : events) {
            String severity = String.valueOf(event.getOrDefault("severity", "WARNING"));
            String label = String.valueOf(event.getOrDefault("label", "unknown"));
            long eventTs = toLong(event.get("ts_ms"), System.currentTimeMillis());
            long eventStartTs = toLong(event.get("start_ts_ms"), eventTs);
            long eventEndTs = toLong(event.get("end_ts_ms"), eventTs);
            if (eventEndTs < eventStartTs) {
                long tmp = eventStartTs;
                eventStartTs = eventEndTs;
                eventEndTs = tmp;
            }
            String taskId = UUID.randomUUID().toString().replace("-", "");

            AnomalyClipTaskEntity task = buildTask(taskId, roomId, studentId, schoolId, session, studentName, invigilatorName, label, severity, eventTs, eventStartTs, eventEndTs);
            try {
                anomalyClipTaskMapper.insert(task);
                clipTaskQueue.offer(taskId);
                Map<String, Object> pending = new LinkedHashMap<>();
                pending.put("clipTaskId", taskId);
                pending.put("status", "PENDING");
                pending.put("anomalyTsMs", eventTs);
                pending.put("anomalyStartTsMs", eventStartTs);
                pending.put("anomalyEndTsMs", eventEndTs);
                pending.put("anomalyLabel", label);
                out.add(pending);
            } catch (Exception ex) {
                log.warn("Failed to enqueue clip task: taskId={}, err={}", taskId, ex.toString());
            }
        }
        return out;
    }

    public List<Map<String, Object>> listByRoom(Long roomId) {
        return anomalyEvidenceMapper.selectByRoom(roomId).stream().map(this::toMap).toList();
    }

    public List<Map<String, Object>> listBySchool(Long schoolId) {
        return anomalyEvidenceMapper.selectBySchool(schoolId).stream().map(this::toMap).toList();
    }

    public List<Map<String, Object>> listAll() {
        return anomalyEvidenceMapper.selectAllOrdered().stream().map(this::toMap).toList();
    }

    public Map<String, Object> getEvidence(String evidenceId) {
        AnomalyEvidenceEntity entity = anomalyEvidenceMapper.selectByEvidenceId(evidenceId);
        return entity == null ? null : toMap(entity);
    }

    public Resource loadMedia(String evidenceId) {
        AnomalyEvidenceEntity record = anomalyEvidenceMapper.selectByEvidenceId(evidenceId);
        if (record == null) {
            return null;
        }
        Path path = Paths.get(record.getFilePath());
        return Files.exists(path) ? new FileSystemResource(path) : null;
    }

    public Map<String, Object> updateReview(String evidenceId, String reviewStatus, String reviewNote, Long reviewerUserId, String reviewerName) {
        AnomalyEvidenceEntity entity = anomalyEvidenceMapper.selectByEvidenceId(evidenceId);
        if (entity == null) {
            return null;
        }
        entity.setReviewStatus(reviewStatus);
        entity.setReviewNote(reviewNote);
        entity.setReviewedByUserId(reviewerUserId);
        entity.setReviewedByName(reviewerName);
        entity.setReviewedAt(LocalDateTime.now());
        anomalyEvidenceMapper.updateById(entity);
        return toMap(entity);
    }

    public void markViewed(String evidenceId) {
        AnomalyEvidenceEntity entity = anomalyEvidenceMapper.selectByEvidenceId(evidenceId);
        if (entity == null) {
            return;
        }
        entity.setLastViewedAt(LocalDateTime.now());
        anomalyEvidenceMapper.updateById(entity);
    }

    private void runClipWorker() {
        while (clipWorkerRunning) {
            try {
                String taskId = clipTaskQueue.poll(2, TimeUnit.SECONDS);
                if (taskId != null) {
                    processClipTask(taskId);
                    continue;
                }
                List<AnomalyClipTaskEntity> pending = anomalyClipTaskMapper.selectPending(20);
                for (AnomalyClipTaskEntity task : pending) {
                    processClipTask(task.getTaskId());
                }
            } catch (InterruptedException ignore) {
                Thread.currentThread().interrupt();
                return;
            } catch (Exception ex) {
                log.warn("clip worker tick failed: {}", ex.toString());
            }
        }
    }

    private void processClipTask(String taskId) {
        AnomalyClipTaskEntity task = anomalyClipTaskMapper.selectByTaskId(taskId);
        if (task == null || !"PENDING".equalsIgnoreCase(task.getStatus())) {
            return;
        }
        if (!isClipWindowReady(task)) {
            return;
        }
        try {
            task.setStatus("PROCESSING");
            task.setUpdatedAt(LocalDateTime.now());
            anomalyClipTaskMapper.updateById(task);

            EvidenceRecord record = saveEvidence(task);
            persist(record);

            task.setStatus("DONE");
            task.setEvidenceId(record.evidenceId());
            task.setUpdatedAt(LocalDateTime.now());
            anomalyClipTaskMapper.updateById(task);
        } catch (Exception ex) {
            task.setStatus("FAILED");
            task.setErrorMsg(ex.getMessage());
            task.setUpdatedAt(LocalDateTime.now());
            anomalyClipTaskMapper.updateById(task);
        }
    }

    private boolean isClipWindowReady(AnomalyClipTaskEntity task) {
        long eventTsMs = task.getAnomalyTsMs() == null ? System.currentTimeMillis() : task.getAnomalyTsMs();
        long now = System.currentTimeMillis();
        long minWait = Math.max(Math.max(0L, paddingAfterMs), Math.max(0L, chunkDurationMs));
        long readyAt = eventTsMs + minWait + Math.max(0L, clipReadyDelayMs);
        if (now < readyAt) {
            return false;
        }

        if (!isSessionCompleted(task.getSessionId())) {
            return false;
        }

        Long roomId = task.getExamRoomId();
        Long studentId = task.getStudentId();
        if (roomId == null || studentId == null) {
            return true;
        }

        long expectedTailTs = eventTsMs + Math.max(0L, paddingAfterMs);
        long scanToTs = expectedTailTs + Math.max(0L, chunkDurationMs) + Math.max(0L, clipReadyDelayMs);
        try {
            List<RecordingSegmentEntity> segments = recordingSegmentMapper.selectByWindow(roomId, studentId, eventTsMs, scanToTs);
            boolean hasExpectedTail = segments.stream().anyMatch(s -> s.getChunkEndTsMs() != null && s.getChunkEndTsMs() >= expectedTailTs);
            if (hasExpectedTail) {
                return true;
            }
        } catch (Exception ex) {
            log.debug("clip readiness segment check failed: taskId={}, err={}", task.getTaskId(), ex.toString());
            return true;
        }

        long hardDeadline = eventTsMs + Math.max(0L, clipMaxWaitMs);
        return now >= hardDeadline;
    }

    private boolean isSessionCompleted(Long sessionId) {
        if (sessionId == null) {
            return true;
        }
        try {
            String status = examSessionMapper.selectStatusBySessionId(sessionId);
            return "FINISHED".equalsIgnoreCase(status) || "CANCELLED".equalsIgnoreCase(status);
        } catch (Exception ex) {
            log.debug("session status check failed: sessionId={}, err={}", sessionId, ex.toString());
            return true;
        }
    }

    private EvidenceRecord saveEvidence(AnomalyClipTaskEntity task) throws IOException {
        long eventTsMs = task.getAnomalyTsMs() == null ? System.currentTimeMillis() : task.getAnomalyTsMs();
        long eventStartTsMs = task.getAnomalyStartTsMs() == null ? eventTsMs : task.getAnomalyStartTsMs();
        long eventEndTsMs = task.getAnomalyEndTsMs() == null ? eventTsMs : task.getAnomalyEndTsMs();
        if (eventEndTsMs < eventStartTsMs) {
            long tmp = eventStartTsMs;
            eventStartTsMs = eventEndTsMs;
            eventEndTsMs = tmp;
        }
        Long roomId = task.getExamRoomId();
        Long studentId = task.getStudentId();

        List<VideoChunkSnapshot> videoChunks = getVideoChunks(roomId, studentId, eventStartTsMs, eventEndTsMs);
        List<FrameSnapshot> snapshots = getFrames(roomId, studentId, eventStartTsMs, eventEndTsMs);
        if (videoChunks.isEmpty() && snapshots.isEmpty()) {
            throw new IOException("No available snapshot");
        }

        for (VideoChunkSnapshot chunk : videoChunks) {
            saveSegmentLink(task.getTaskId(), chunk.segmentId());
        }

        String evidenceId = UUID.randomUUID().toString().replace("-", "");
        LocalDateTime ldt = LocalDateTime.ofInstant(Instant.ofEpochMilli(eventStartTsMs), ZoneOffset.UTC);
        String baseName = TS_FMT.format(ldt) + "_room" + roomId + "_student" + studentId + "_" + evidenceId;

        StoragePathSpec storagePath = resolveStoragePath(studentId, task.getSessionId(), task.getSchoolId(), task.getStudentName(), task.getExamName());
        Path dir = storagePath.evidenceDir();
        Files.createDirectories(dir);

        MediaSpec media = buildMedia(task, eventTsMs, eventStartTsMs, eventEndTsMs, videoChunks, snapshots, dir, baseName);

        return new EvidenceRecord(
                evidenceId,
                roomId,
                studentId,
                task.getSchoolId(),
                task.getExamId(),
                task.getSessionId(),
                task.getExamName(),
                task.getRoomId(),
                task.getStudentName(),
                task.getInvigilatorName(),
                task.getAnomalyLabel(),
                task.getSeverity(),
                eventTsMs,
                media.filePath(),
                media.mediaType(),
                media.mediaExt(),
                !videoChunks.isEmpty() ? videoChunks.size() : snapshots.size());
    }

    private List<FrameSnapshot> getFrames(Long roomId, Long studentId, long eventStartTsMs, long eventEndTsMs) {
        String key = roomId + ":" + studentId;
        Deque<FrameSnapshot> deque = frameBuffers.get(key);
        if (deque == null) {
            return List.of();
        }
        synchronized (deque) {
            long fromTs = Math.max(0L, eventStartTsMs - Math.max(0L, paddingBeforeMs));
            long toTs = eventEndTsMs + Math.max(0L, paddingAfterMs);

            List<FrameSnapshot> windowFrames = new ArrayList<>();
            for (FrameSnapshot snapshot : deque) {
                long ts = snapshot.tsMs();
                if (ts >= fromTs && ts <= toTs) {
                    windowFrames.add(snapshot);
                }
            }
            if (!windowFrames.isEmpty()) {
                return trimToMaxFrames(windowFrames);
            }
            return List.of();
        }
    }

    private List<VideoChunkSnapshot> getVideoChunks(Long roomId, Long studentId, long eventStartTsMs, long eventEndTsMs) {
        long fromTs = Math.max(0L, eventStartTsMs - Math.max(0L, paddingBeforeMs));
        long toTs = eventEndTsMs + Math.max(0L, paddingAfterMs);
        List<VideoChunkSnapshot> db = recordingSegmentMapper.selectByWindow(roomId, studentId, fromTs, toTs)
                .stream()
                .map(s -> new VideoChunkSnapshot(s.getSegmentId(), s.getChunkStartTsMs(), s.getChunkEndTsMs(), s.getMediaType(), s.getFilePath()))
                .toList();
        if (!db.isEmpty()) {
            return db;
        }

        String key = roomId + ":" + studentId;
        Deque<VideoChunkSnapshot> deque = videoChunkBuffers.get(key);
        if (deque == null) {
            return List.of();
        }
        synchronized (deque) {
            List<VideoChunkSnapshot> selected = new ArrayList<>();
            for (VideoChunkSnapshot snapshot : deque) {
                if (snapshot.endTsMs() >= fromTs && snapshot.startTsMs() <= toTs) {
                    selected.add(snapshot);
                }
            }
            return selected;
        }
    }

    private List<FrameSnapshot> trimToMaxFrames(List<FrameSnapshot> frames) {
        if (frames.size() <= maxFramesPerVideo) {
            return frames;
        }
        int skip = frames.size() - maxFramesPerVideo;
        List<FrameSnapshot> out = new ArrayList<>(maxFramesPerVideo);
        for (int i = skip; i < frames.size(); i++) {
            out.add(frames.get(i));
        }
        return out;
    }

    private MediaSpec buildMedia(AnomalyClipTaskEntity task,
                                 long eventTsMs,
                                 long eventStartTsMs,
                                 long eventEndTsMs,
                                 List<VideoChunkSnapshot> videoChunks,
                                 List<FrameSnapshot> snapshots,
                                 Path dir,
                                 String baseName) throws IOException {
        MediaSpec fromFullVideo = tryBuildFromFullSessionVideo(task, eventTsMs, eventStartTsMs, eventEndTsMs, dir, baseName);
        if (fromFullVideo != null) {
            return fromFullVideo;
        }
        MediaSpec fromChunkWindow = tryBuildFromChunkWindow(videoChunks, dir, baseName);
        if (fromChunkWindow != null) {
            return fromChunkWindow;
        }
        String normalized = videoFormat == null ? "mp4" : videoFormat.trim().toLowerCase(Locale.ROOT);
        if (normalized.isEmpty() || "gif".equals(normalized)) {
            normalized = "mp4";
        }
        Path videoPath = dir.resolve(baseName + "." + normalized);
        double fps = estimateFps(snapshots);
        if (tryCreateVideoWithFfmpeg(snapshots, videoPath, fps)) {
            String mediaType = "webm".equals(normalized) ? "video/webm" : "video/mp4";
            return new MediaSpec(videoPath.toAbsolutePath().toString(), mediaType, normalized);
        }
        throw new IOException("Unable to build video evidence");
    }

    private MediaSpec tryBuildFromFullSessionVideo(AnomalyClipTaskEntity task,
                                                   long eventTsMs,
                                                   long eventStartTsMs,
                                                   long eventEndTsMs,
                                                   Path outputDir,
                                                   String baseName) {
        Long sessionId = task.getSessionId();
        Long studentId = task.getStudentId();
        if (sessionId == null || studentId == null) {
            return null;
        }
        List<RecordingSegmentEntity> segments = recordingSegmentMapper.selectBySession(sessionId, studentId);
        if (segments.isEmpty()) {
            return null;
        }
        List<VideoChunkSnapshot> fullChunks = segments.stream()
                .map(s -> new VideoChunkSnapshot(s.getSegmentId(), safeLong(s.getChunkStartTsMs(), 0L), safeLong(s.getChunkEndTsMs(), 0L), s.getMediaType(), s.getFilePath()))
                .toList();
        for (VideoChunkSnapshot chunk : fullChunks) {
            saveSegmentLink(task.getTaskId(), chunk.segmentId());
        }

        Path tmpDir = Paths.get(evidenceDir, tmpFullVideoDir);
        Path fullVideoPath = tmpDir.resolve(String.format(Locale.ROOT, "session_%d_student_%d_full.webm", sessionId, studentId));
        String outExt = normalizeVideoExt();
        String outMediaType = "webm".equals(outExt) ? "video/webm" : "video/mp4";
        Path clipPath = outputDir.resolve(baseName + "." + outExt);

        try {
            Files.createDirectories(tmpDir);
            if (!tryAppendVideoChunks(fullChunks, fullVideoPath)) {
                return null;
            }
            long baseTs = safeLong(segments.get(0).getChunkStartTsMs(), eventTsMs);
            double clipStartSec = Math.max(0d, (eventStartTsMs - Math.max(0L, paddingBeforeMs) - baseTs) / 1000.0d);
            double clipEndSec = Math.max(clipStartSec + 0.2d, (eventEndTsMs + Math.max(0L, paddingAfterMs) - baseTs) / 1000.0d);
            if (!tryClipVideoWithFfmpeg(fullVideoPath, clipPath, clipStartSec, clipEndSec)) {
                return null;
            }
            return new MediaSpec(clipPath.toAbsolutePath().toString(), outMediaType, outExt);
        } catch (Exception ex) {
            log.warn("full-session clip failed: sessionId={}, studentId={}, err={}", sessionId, studentId, ex.toString());
            return null;
        } finally {
            try {
                Files.deleteIfExists(fullVideoPath);
            } catch (IOException ignore) {
            }
        }
    }

    private MediaSpec tryBuildFromChunkWindow(List<VideoChunkSnapshot> videoChunks, Path outputDir, String baseName) {
        if (videoChunks == null || videoChunks.isEmpty()) {
            return null;
        }
        Path tmpDir = Paths.get(evidenceDir, tmpFullVideoDir);
        Path stitchedPath = tmpDir.resolve(baseName + "_window.webm");
        try {
            Files.createDirectories(tmpDir);
            if (!tryAppendVideoChunks(videoChunks, stitchedPath)) {
                return null;
            }

            String outExt = normalizeVideoExt();
            String outMediaType = mediaTypeForExt(outExt);
            Path outputPath = outputDir.resolve(baseName + "." + outExt);
            if ("webm".equals(outExt)) {
                Files.move(stitchedPath, outputPath, StandardCopyOption.REPLACE_EXISTING);
                return isUsableVideoOutput(outputPath)
                        ? new MediaSpec(outputPath.toAbsolutePath().toString(), outMediaType, outExt)
                        : null;
            }

            if (tryTranscodeVideoWithFfmpeg(stitchedPath, outputPath)) {
                return new MediaSpec(outputPath.toAbsolutePath().toString(), outMediaType, outExt);
            }
            return null;
        } catch (Exception ex) {
            log.warn("chunk-window clip failed: err={}", ex.toString());
            return null;
        } finally {
            try {
                Files.deleteIfExists(stitchedPath);
            } catch (IOException ignore) {
            }
        }
    }

    private String normalizeVideoExt() {
        String normalized = videoFormat == null ? "mp4" : videoFormat.trim().toLowerCase(Locale.ROOT);
        if (normalized.isEmpty() || "gif".equals(normalized)) {
            return "mp4";
        }
        return normalized;
    }

    private String mediaTypeForExt(String ext) {
        return "webm".equals(ext) ? "video/webm" : "video/mp4";
    }

    private StoragePathSpec resolveStoragePath(Long studentId,
                                               Long sessionId,
                                               Long schoolId,
                                               String studentName,
                                               String examName) {
        Map<String, Object> profile = studentId == null ? null : studentMapper.selectStudentProfileByUserId(studentId);
        Map<String, Object> session = (studentId == null || sessionId == null)
                ? null
                : examSessionMapper.selectSessionRoomByStudentAndSessionId(studentId, sessionId);

        String schoolDir = sanitizePathSegment(
                readString(profile, "schoolName"),
                schoolId == null ? "school-unknown" : "school-" + schoolId);
        String departmentDir = sanitizePathSegment(
                readString(profile, "departmentName"),
                "department-unknown");
        String majorDir = sanitizePathSegment(
                readString(profile, "majorName"),
                "major-unknown");
        String sessionDir = sanitizePathSegment(
                buildSessionFolderName(sessionId, firstNonBlank(readString(session, "examName"), examName)),
                sessionId == null ? "session-unknown" : "session-" + sessionId);
        String studentDir = sanitizePathSegment(
                buildStudentFolderName(studentId, firstNonBlank(readString(profile, "name"), studentName)),
                studentId == null ? "student-unknown" : "student-" + studentId);

        Path baseDir = Paths.get(evidenceDir, schoolDir, departmentDir, majorDir, sessionDir, studentDir);
        return new StoragePathSpec(baseDir.resolve("evidence"), baseDir.resolve("full-recordings"));
    }

    private String buildSessionFolderName(Long sessionId, String examName) {
        String sessionPart = sessionId == null ? "session-unknown" : "session-" + sessionId;
        String examPart = firstNonBlank(examName, "");
        if (examPart.isBlank()) {
            return sessionPart;
        }
        return sessionPart + "_" + examPart;
    }

    private String buildStudentFolderName(Long studentId, String studentName) {
        String studentPart = studentId == null ? "student-unknown" : "student-" + studentId;
        String namePart = firstNonBlank(studentName, "");
        if (namePart.isBlank()) {
            return studentPart;
        }
        return studentPart + "_" + namePart;
    }

    private String sanitizePathSegment(String raw, String fallback) {
        String candidate = firstNonBlank(raw, fallback);
        candidate = candidate
                .replaceAll("[<>:\"/\\\\|?*\\p{Cntrl}]", "_")
                .replaceAll("\\s+", " ")
                .trim();
        while (!candidate.isEmpty() && (candidate.endsWith(".") || candidate.endsWith(" "))) {
            candidate = candidate.substring(0, candidate.length() - 1).trim();
        }
        if (candidate.isBlank()) {
            candidate = fallback;
        }
        if (candidate.length() > 80) {
            candidate = candidate.substring(0, 80).trim();
        }
        return candidate.isBlank() ? fallback : candidate;
    }

    private String firstNonBlank(String... values) {
        if (values == null) {
            return "";
        }
        for (String value : values) {
            if (value != null && !value.isBlank()) {
                return value.trim();
            }
        }
        return "";
    }

    private String readString(Map<String, Object> source, String key) {
        if (source == null || key == null) {
            return null;
        }
        Object value = source.get(key);
        return value == null ? null : String.valueOf(value);
    }

    private long safeLong(Long value, long defaultVal) {
        return value == null ? defaultVal : value;
    }

    private boolean tryClipVideoWithFfmpeg(Path inputPath, Path outputPath, double clipStartSec, double clipEndSec) {
        Path tempDir = null;
        try {
            tempDir = Files.createTempDirectory("evidence-full-clip-");
            String ext = fileExt(outputPath);
            List<String> cmd = new ArrayList<>(List.of(
                    "ffmpeg", "-y",
                    "-fflags", "+genpts",
                    "-err_detect", "ignore_err",
                    "-ss", String.format(Locale.ROOT, "%.3f", clipStartSec),
                    "-to", String.format(Locale.ROOT, "%.3f", clipEndSec),
                    "-i", inputPath.toAbsolutePath().toString()));
            appendTranscodeArgs(cmd, ext);
            cmd.add(outputPath.toAbsolutePath().toString());
            ProcessBuilder pb = new ProcessBuilder(cmd);
            pb.directory(tempDir.toFile());
            pb.redirectErrorStream(true);
            Process process = pb.start();
            try (InputStream in = process.getInputStream()) {
                in.transferTo(java.io.OutputStream.nullOutputStream());
            }
            int code = process.waitFor();
            return code == 0 && isUsableVideoOutput(outputPath);
        } catch (Exception ignore) {
            return false;
        } finally {
            if (tempDir != null) {
                try (var stream = Files.list(tempDir)) {
                    stream.forEach(path -> {
                        try {
                            Files.deleteIfExists(path);
                        } catch (IOException ignore) {
                        }
                    });
                } catch (Exception ignore) {
                }
                try {
                    Files.deleteIfExists(tempDir);
                } catch (IOException ignore) {
                }
            }
        }
    }

    private boolean tryTranscodeVideoWithFfmpeg(Path inputPath, Path outputPath) {
        Path tempDir = null;
        try {
            tempDir = Files.createTempDirectory("evidence-transcode-");
            String ext = fileExt(outputPath);
            List<String> cmd = new ArrayList<>(List.of(
                    "ffmpeg", "-y",
                    "-fflags", "+genpts",
                    "-err_detect", "ignore_err",
                    "-i", inputPath.toAbsolutePath().toString()));
            appendTranscodeArgs(cmd, ext);
            cmd.add(outputPath.toAbsolutePath().toString());
            ProcessBuilder pb = new ProcessBuilder(cmd);
            pb.directory(tempDir.toFile());
            pb.redirectErrorStream(true);
            Process process = pb.start();
            try (InputStream in = process.getInputStream()) {
                in.transferTo(java.io.OutputStream.nullOutputStream());
            }
            int code = process.waitFor();
            return code == 0 && isUsableVideoOutput(outputPath);
        } catch (Exception ignore) {
            return false;
        } finally {
            if (tempDir != null) {
                try (var stream = Files.list(tempDir)) {
                    stream.forEach(path -> {
                        try {
                            Files.deleteIfExists(path);
                        } catch (IOException ignore) {
                        }
                    });
                } catch (Exception ignore) {
                }
                try {
                    Files.deleteIfExists(tempDir);
                } catch (IOException ignore) {
                }
            }
        }
    }

    private void appendTranscodeArgs(List<String> cmd, String ext) {
        cmd.addAll(List.of("-map", "0:v:0", "-map", "0:a?"));
        if ("webm".equals(ext)) {
            cmd.addAll(List.of("-c:v", "libvpx-vp9", "-crf", "30", "-b:v", "0", "-c:a", "libopus", "-b:a", "96k"));
            return;
        }
        cmd.addAll(List.of("-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-c:a", "aac", "-b:a", "128k"));
    }

    private void saveSegmentLink(String taskId, String segmentId) {
        if (taskId == null || segmentId == null || segmentId.isBlank()) {
            return;
        }
        AnomalySegmentLinkEntity link = new AnomalySegmentLinkEntity();
        link.setTaskId(taskId);
        link.setSegmentId(segmentId);
        try {
            anomalySegmentLinkMapper.insert(link);
        } catch (Exception ignore) {
        }
    }

    private boolean tryAppendVideoChunks(List<VideoChunkSnapshot> chunks, Path targetPath) {
        try {
            if (chunks == null || chunks.isEmpty()) {
                return false;
            }
            Files.createDirectories(targetPath.getParent());
            boolean wroteAny = false;
            // MediaRecorder timeslice blobs are sequential stream fragments, not standalone WebM files.
            try (OutputStream out = new BufferedOutputStream(Files.newOutputStream(
                    targetPath,
                    StandardOpenOption.CREATE,
                    StandardOpenOption.TRUNCATE_EXISTING,
                    StandardOpenOption.WRITE))) {
                List<VideoChunkSnapshot> ordered = chunks.stream()
                        .sorted(Comparator
                                .comparingLong(VideoChunkSnapshot::startTsMs)
                                .thenComparingLong(VideoChunkSnapshot::endTsMs)
                                .thenComparing(chunk -> chunk.segmentId() == null ? "" : chunk.segmentId()))
                        .toList();
                for (VideoChunkSnapshot chunk : ordered) {
                    if (chunk.filePath() == null || chunk.filePath().isBlank()) {
                        continue;
                    }
                    Path path = Paths.get(chunk.filePath());
                    if (!Files.exists(path) || !Files.isRegularFile(path)) {
                        continue;
                    }
                    Files.copy(path, out);
                    wroteAny = true;
                }
            }
            if (!wroteAny) {
                Files.deleteIfExists(targetPath);
                return false;
            }
            return isUsableVideoOutput(targetPath);
        } catch (Exception ignore) {
            return false;
        }
    }

    private boolean isUsableVideoOutput(Path outputPath) {
        try {
            return Files.exists(outputPath) && Files.size(outputPath) > 1024L;
        } catch (IOException ignore) {
            return false;
        }
    }

    private String fileExt(Path path) {
        String name = path == null ? "" : path.getFileName().toString().toLowerCase(Locale.ROOT);
        int idx = name.lastIndexOf('.');
        if (idx < 0 || idx == name.length() - 1) {
            return "mp4";
        }
        return name.substring(idx + 1);
    }

    private double estimateFps(List<FrameSnapshot> snapshots) {
        if (snapshots == null || snapshots.size() <= 1) {
            return 1.0d;
        }
        long start = snapshots.get(0).tsMs();
        long end = snapshots.get(snapshots.size() - 1).tsMs();
        long durationMs = Math.max(1L, end - start);
        double fps = (snapshots.size() - 1) * 1000.0d / durationMs;
        return Math.max(1.0d, Math.min(30.0d, fps));
    }

    private boolean tryCreateVideoWithFfmpeg(List<FrameSnapshot> snapshots, Path videoPath, double fps) {
        Path tempDir = null;
        try {
            tempDir = Files.createTempDirectory("evidence-frames-");
            for (int i = 0; i < snapshots.size(); i++) {
                BufferedImage image = ImageIO.read(new java.io.ByteArrayInputStream(snapshots.get(i).bytes()));
                if (image == null) {
                    continue;
                }
                Path framePath = tempDir.resolve(String.format(Locale.ROOT, "frame-%04d.png", i));
                ImageIO.write(image, "png", framePath.toFile());
            }
            ProcessBuilder pb = new ProcessBuilder(
                    "ffmpeg", "-y", "-framerate", String.format(Locale.ROOT, "%.3f", fps), "-i", "frame-%04d.png",
                    "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p", "-movflags", "+faststart", videoPath.toAbsolutePath().toString());
            pb.directory(tempDir.toFile());
            pb.redirectErrorStream(true);
            Process process = pb.start();
            try (InputStream in = process.getInputStream()) {
                in.transferTo(java.io.OutputStream.nullOutputStream());
            }
            int code = process.waitFor();
            return code == 0 && isUsableVideoOutput(videoPath);
        } catch (Exception ignore) {
            return false;
        } finally {
            if (tempDir != null) {
                try (var stream = Files.list(tempDir)) {
                    stream.forEach(path -> {
                        try {
                            Files.deleteIfExists(path);
                        } catch (IOException ignore) {
                        }
                    });
                } catch (Exception ignore) {
                }
                try {
                    Files.deleteIfExists(tempDir);
                } catch (IOException ignore) {
                }
            }
        }
    }

    private void persist(EvidenceRecord record) {
        evidences.put(record.evidenceId(), record);
        AnomalyEvidenceEntity entity = new AnomalyEvidenceEntity();
        entity.setEvidenceId(record.evidenceId());
        entity.setExamRoomId(record.examRoomId());
        entity.setStudentId(record.studentId());
        entity.setSchoolId(record.schoolId());
        entity.setExamId(record.examId());
        entity.setSessionId(record.sessionId());
        entity.setExamName(record.examName());
        entity.setRoomId(record.roomId());
        entity.setStudentName(record.studentName());
        entity.setInvigilatorName(record.invigilatorName());
        entity.setAnomalyLabel(record.anomalyLabel());
        entity.setSeverity(record.severity());
        entity.setAnomalyTsMs(record.anomalyTsMs());
        entity.setAnomalyAt(LocalDateTime.ofInstant(Instant.ofEpochMilli(record.anomalyTsMs()), ZoneOffset.UTC));
        entity.setFilePath(record.filePath());
        entity.setMediaType(record.mediaType());
        entity.setMediaExt(record.mediaExt());
        entity.setFrameCount(record.frameCount());
        entity.setReviewStatus("PENDING");
        try {
            anomalyEvidenceMapper.insert(entity);
        } catch (Exception ignore) {
        }
    }

    private AnomalyClipTaskEntity buildTask(String taskId,
                                            Long roomId,
                                            Long studentId,
                                            Long schoolId,
                                            Map<String, Object> session,
                                            String studentName,
                                            String invigilatorName,
                                            String label,
                                            String severity,
                                            long eventTs,
                                            long eventStartTs,
                                            long eventEndTs) {
        AnomalyClipTaskEntity task = new AnomalyClipTaskEntity();
        task.setTaskId(taskId);
        task.setExamRoomId(roomId);
        task.setStudentId(studentId);
        task.setSchoolId(schoolId);
        task.setExamId(session != null && session.get("examId") instanceof Number n ? n.longValue() : null);
        task.setSessionId(session != null && session.get("sessionId") instanceof Number n ? n.longValue() : null);
        task.setExamName(session == null ? null : String.valueOf(session.getOrDefault("examName", "")));
        task.setRoomId(session == null ? null : String.valueOf(session.getOrDefault("roomId", "")));
        task.setStudentName(studentName);
        task.setInvigilatorName(invigilatorName);
        task.setAnomalyLabel(label);
        task.setSeverity(severity);
        task.setAnomalyTsMs(eventTs);
        task.setAnomalyStartTsMs(eventStartTs);
        task.setAnomalyEndTsMs(eventEndTs);
        task.setStatus("PENDING");
        return task;
    }

    private long toLong(Object value, long defaultVal) {
        if (value instanceof Number n) {
            return n.longValue();
        }
        try {
            return Long.parseLong(String.valueOf(value));
        } catch (Exception ignore) {
            return defaultVal;
        }
    }

    private Map<String, Object> toMap(AnomalyEvidenceEntity record) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("evidenceId", record.getEvidenceId());
        m.put("examRoomId", record.getExamRoomId());
        m.put("studentId", record.getStudentId());
        m.put("schoolId", record.getSchoolId());
        m.put("examId", record.getExamId());
        m.put("sessionId", record.getSessionId());
        m.put("examName", record.getExamName());
        m.put("roomId", record.getRoomId());
        m.put("studentName", record.getStudentName());
        m.put("invigilatorName", record.getInvigilatorName());
        m.put("anomalyLabel", record.getAnomalyLabel());
        m.put("severity", record.getSeverity());
        m.put("anomalyTsMs", record.getAnomalyTsMs());
        m.put("anomalyAt", record.getAnomalyAt() == null ? null : record.getAnomalyAt().toString());
        m.put("mediaType", record.getMediaType());
        m.put("frameCount", record.getFrameCount());
        m.put("mediaExt", record.getMediaExt());
        m.put("reviewStatus", record.getReviewStatus());
        m.put("reviewNote", record.getReviewNote());
        m.put("reviewedByUserId", record.getReviewedByUserId());
        m.put("reviewedByName", record.getReviewedByName());
        m.put("reviewedAt", record.getReviewedAt() == null ? null : record.getReviewedAt().toString());
        m.put("lastViewedAt", record.getLastViewedAt() == null ? null : record.getLastViewedAt().toString());
        m.put("mediaUrl", "/api/evidence/" + record.getEvidenceId() + "/media");
        return m;
    }

    private record FrameSnapshot(long tsMs, String mime, byte[] bytes) {
    }

    private record VideoChunkSnapshot(String segmentId, long startTsMs, long endTsMs, String mime, String filePath) {
    }

    private record EvidenceRecord(
            String evidenceId,
            Long examRoomId,
            Long studentId,
            Long schoolId,
            Long examId,
            Long sessionId,
            String examName,
            String roomId,
            String studentName,
            String invigilatorName,
            String anomalyLabel,
            String severity,
            long anomalyTsMs,
            String filePath,
            String mediaType,
            String mediaExt,
            int frameCount) {
    }

    private record MediaSpec(String filePath, String mediaType, String mediaExt) {
    }

    private record StoragePathSpec(Path evidenceDir, Path recordingDir) {
    }
}







