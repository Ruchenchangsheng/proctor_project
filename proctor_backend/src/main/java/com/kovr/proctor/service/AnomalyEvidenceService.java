package com.kovr.proctor.service;

import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;

import javax.imageio.IIOImage;
import javax.imageio.ImageIO;
import javax.imageio.ImageTypeSpecifier;
import javax.imageio.ImageWriteParam;
import javax.imageio.ImageWriter;
import javax.imageio.metadata.IIOMetadata;
import javax.imageio.metadata.IIOMetadataNode;
import javax.imageio.stream.ImageOutputStream;
import java.awt.image.BufferedImage;
import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
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
import java.util.concurrent.ConcurrentHashMap;

@Service
@RequiredArgsConstructor
public class AnomalyEvidenceService {
    private static final DateTimeFormatter TS_FMT = DateTimeFormatter.ofPattern("yyyyMMddHHmmss");

    private final ConcurrentHashMap<String, Deque<FrameSnapshot>> frameBuffers = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, EvidenceRecord> evidences = new ConcurrentHashMap<>();
    private final AnomalyPolicyService anomalyPolicyService;

    @Value("${anomaly.evidence.dir:./data/anomaly-evidence}")
    private String evidenceDir;

    @Value("${anomaly.evidence.frame-buffer-size:24}")
    private int frameBufferSize;

    @Value("${anomaly.evidence.max-frames-per-gif:18}")
    private int maxFramesPerGif;

    @Value("${anomaly.evidence.padding-before-ms:1000}")
    private long paddingBeforeMs;

    @Value("${anomaly.evidence.padding-after-ms:1000}")
    private long paddingAfterMs;

    @Value("${anomaly.evidence.video-format:mp4}")
    private String videoFormat;

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
            try {
                EvidenceRecord record = saveEvidence(roomId, studentId, schoolId, session, studentName, invigilatorName, severity, label, eventTs);
                evidences.put(record.evidenceId(), record);
                out.add(toMap(record));
            } catch (Exception ignore) {
                // 存证失败时不影响主流程（异常事件仍然上报）
            }
        }
        return out;
    }

    public List<Map<String, Object>> listByRoom(Long roomId) {
        List<Map<String, Object>> out = new ArrayList<>();
        evidences.values().forEach(record -> {
            if (roomId.equals(record.examRoomId())) {
                out.add(toMap(record));
            }
        });
        out.sort(Comparator.comparingLong((Map<String, Object> m) -> toLong(m.get("anomalyTsMs"), 0L)).reversed());
        return out;
    }

    public List<Map<String, Object>> listBySchool(Long schoolId) {
        List<Map<String, Object>> out = new ArrayList<>();
        evidences.values().forEach(record -> {
            if (schoolId.equals(record.schoolId())) {
                out.add(toMap(record));
            }
        });
        out.sort(Comparator.comparingLong((Map<String, Object> m) -> toLong(m.get("anomalyTsMs"), 0L)).reversed());
        return out;
    }

    public List<Map<String, Object>> listAll() {
        List<Map<String, Object>> out = new ArrayList<>();
        evidences.values().forEach(record -> out.add(toMap(record)));
        out.sort(Comparator.comparingLong((Map<String, Object> m) -> toLong(m.get("anomalyTsMs"), 0L)).reversed());
        return out;
    }

    public Map<String, Object> getEvidence(String evidenceId) {
        EvidenceRecord record = evidences.get(evidenceId);
        return record == null ? null : toMap(record);
    }

    public Resource loadMedia(String evidenceId) {
        EvidenceRecord record = evidences.get(evidenceId);
        if (record == null) {
            return null;
        }
        Path path = Paths.get(record.filePath());
        return Files.exists(path) ? new FileSystemResource(path) : null;
    }

    private EvidenceRecord saveEvidence(
            Long roomId,
            Long studentId,
            Long schoolId,
            Map<String, Object> session,
            String studentName,
            String invigilatorName,
            String severity,
            String label,
            long eventTsMs) throws IOException {
        List<FrameSnapshot> snapshots = getFrames(roomId, studentId, eventTsMs);
        if (snapshots.isEmpty()) {
            throw new IOException("No available frame snapshot");
        }

        String evidenceId = UUID.randomUUID().toString().replace("-", "");
        LocalDateTime ldt = LocalDateTime.ofInstant(Instant.ofEpochMilli(eventTsMs), ZoneOffset.UTC);
        String baseName = TS_FMT.format(ldt) + "_room" + roomId + "_student" + studentId + "_" + evidenceId;

        Path dir = Paths.get(evidenceDir);
        Files.createDirectories(dir);

        MediaSpec media = buildMedia(snapshots, dir, baseName, schoolId);

        String examName = session == null ? null : String.valueOf(session.getOrDefault("examName", ""));
        Long examId = session != null && session.get("examId") instanceof Number n ? n.longValue() : null;
        Long sessionId = session != null && session.get("sessionId") instanceof Number n ? n.longValue() : null;
        String roomNo = session == null ? null : String.valueOf(session.getOrDefault("roomId", ""));

        return new EvidenceRecord(
                evidenceId,
                roomId,
                studentId,
                schoolId,
                examId,
                sessionId,
                examName,
                roomNo,
                studentName,
                invigilatorName,
                label,
                severity,
                eventTsMs,
                media.filePath(),
                media.mediaType(),
                media.mediaExt(),
                snapshots.size());
    }

    private List<FrameSnapshot> getFrames(Long roomId, Long studentId, long eventTsMs) {
        String key = roomId + ":" + studentId;
        Deque<FrameSnapshot> deque = frameBuffers.get(key);
        if (deque == null) {
            return List.of();
        }
        synchronized (deque) {
            long fromTs = Math.max(0L, eventTsMs - Math.max(0L, paddingBeforeMs));
            long toTs = eventTsMs + Math.max(0L, paddingAfterMs);

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

            int skip = Math.max(0, deque.size() - maxFramesPerGif);
            List<FrameSnapshot> tailFrames = new ArrayList<>();
            int i = 0;
            for (FrameSnapshot snapshot : deque) {
                if (i++ >= skip) {
                    tailFrames.add(snapshot);
                }
            }
            return tailFrames;
        }
    }

    private List<FrameSnapshot> trimToMaxFrames(List<FrameSnapshot> frames) {
        if (frames.size() <= maxFramesPerGif) {
            return frames;
        }
        int skip = frames.size() - maxFramesPerGif;
        List<FrameSnapshot> out = new ArrayList<>(maxFramesPerGif);
        for (int i = skip; i < frames.size(); i++) {
            out.add(frames.get(i));
        }
        return out;
    }

    private MediaSpec buildMedia(List<FrameSnapshot> snapshots, Path dir, String baseName, Long schoolId) throws IOException {
        String mediaTypeSetting = anomalyPolicyService.getPolicy(schoolId).evidenceMediaType();
        if ("GIF".equalsIgnoreCase(mediaTypeSetting)) {
            Path gifPath = dir.resolve(baseName + ".gif");
            createGifWithTiming(snapshots, gifPath);
            return new MediaSpec(gifPath.toAbsolutePath().toString(), MediaType.IMAGE_GIF_VALUE, "gif");
        }

        String normalized = videoFormat == null ? "mp4" : videoFormat.trim().toLowerCase(Locale.ROOT);
        if (normalized.isEmpty()) {
            normalized = "mp4";
        }
        Path videoPath = dir.resolve(baseName + "." + normalized);
        double fps = estimateFps(snapshots);
        if (!tryCreateVideoWithFfmpeg(snapshots, videoPath, fps)) {
            throw new IOException("Video encoding failed, ffmpeg unavailable or media invalid");
        }
        String mediaType = "webm".equals(normalized) ? "video/webm" : "video/mp4";
        return new MediaSpec(videoPath.toAbsolutePath().toString(), mediaType, normalized);
    }

    private double estimateFps(List<FrameSnapshot> snapshots) {
        if (snapshots == null || snapshots.size() <= 1) {
            return 1.0d;
        }
        long start = snapshots.get(0).tsMs();
        long end = snapshots.get(snapshots.size() - 1).tsMs();
        long durationMs = Math.max(1L, end - start);
        double fps = (snapshots.size() - 1) * 1000.0d / durationMs;
        return Math.max(0.5d, Math.min(12.0d, fps));
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
                Path framePath = tempDir.resolve(String.format(Locale.ROOT, "frame-%04d.jpg", i));
                ImageIO.write(image, "jpg", framePath.toFile());
            }
            ProcessBuilder pb = new ProcessBuilder(
                    "ffmpeg", "-y", "-framerate", String.format(Locale.ROOT, "%.3f", fps), "-i", "frame-%04d.jpg",
                    "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p", videoPath.toAbsolutePath().toString());
            pb.directory(tempDir.toFile());
            pb.redirectErrorStream(true);
            Process process = pb.start();
            try (InputStream in = process.getInputStream()) {
                in.transferTo(java.io.OutputStream.nullOutputStream());
            }
            int code = process.waitFor();
            return code == 0 && Files.exists(videoPath) && Files.size(videoPath) > 0;
        } catch (Exception ignore) {
            return false;
        } finally {
            if (tempDir != null) {
                try (var stream = Files.list(tempDir)) {
                    stream.forEach(path -> {
                        try { Files.deleteIfExists(path); } catch (IOException ignore) {}
                    });
                } catch (Exception ignore) {}
                try { Files.deleteIfExists(tempDir); } catch (IOException ignore) {}
            }
        }
    }

    private void createGifWithTiming(List<FrameSnapshot> snapshots, Path target) throws IOException {
        ImageWriter writer = ImageIO.getImageWritersByFormatName("gif").next();
        ImageWriteParam params = writer.getDefaultWriteParam();

        try (ImageOutputStream out = ImageIO.createImageOutputStream(Files.newOutputStream(target))) {
            writer.setOutput(out);
            writer.prepareWriteSequence(null);
            for (int i = 0; i < snapshots.size(); i++) {
                BufferedImage image = ImageIO.read(new java.io.ByteArrayInputStream(snapshots.get(i).bytes()));
                if (image == null) continue;
                IIOMetadata metadata = writer.getDefaultImageMetadata(ImageTypeSpecifier.createFromRenderedImage(image), params);
                int delayCs = calculateGifDelayCs(snapshots, i);
                configureGifMetadata(metadata, delayCs, i == snapshots.size() - 1);
                writer.writeToSequence(new IIOImage(image, null, metadata), params);
            }
            writer.endWriteSequence();
        } finally {
            writer.dispose();
        }
    }

    private int calculateGifDelayCs(List<FrameSnapshot> snapshots, int index) {
        if (snapshots.size() <= 1 || index >= snapshots.size() - 1) {
            return 12;
        }
        long cur = snapshots.get(index).tsMs();
        long next = snapshots.get(index + 1).tsMs();
        long deltaMs = Math.max(40L, Math.min(2000L, next - cur));
        return (int) Math.max(1L, deltaMs / 10L);
    }

    private void configureGifMetadata(IIOMetadata metadata, int delayCs, boolean lastFrame) throws IOException {
        String format = metadata.getNativeMetadataFormatName();
        IIOMetadataNode root = (IIOMetadataNode) metadata.getAsTree(format);

        IIOMetadataNode gce = getOrCreateNode(root, "GraphicControlExtension");
        gce.setAttribute("disposalMethod", "none");
        gce.setAttribute("userInputFlag", "FALSE");
        gce.setAttribute("transparentColorFlag", "FALSE");
        gce.setAttribute("delayTime", Integer.toString(delayCs));
        gce.setAttribute("transparentColorIndex", "0");

        IIOMetadataNode appExtensions = getOrCreateNode(root, "ApplicationExtensions");
        IIOMetadataNode appNode = new IIOMetadataNode("ApplicationExtension");
        appNode.setAttribute("applicationID", "NETSCAPE");
        appNode.setAttribute("authenticationCode", "2.0");
        appNode.setUserObject(new byte[]{1, (byte) (lastFrame ? 0 : 0), 0});
        appExtensions.appendChild(appNode);

        metadata.setFromTree(format, root);
    }

    private IIOMetadataNode getOrCreateNode(IIOMetadataNode rootNode, String nodeName) {
        for (int i = 0; i < rootNode.getLength(); i++) {
            if (rootNode.item(i).getNodeName().equalsIgnoreCase(nodeName)) {
                return (IIOMetadataNode) rootNode.item(i);
            }
        }
        IIOMetadataNode node = new IIOMetadataNode(nodeName);
        rootNode.appendChild(node);
        return node;
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

    private Map<String, Object> toMap(EvidenceRecord record) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("evidenceId", record.evidenceId());
        m.put("examRoomId", record.examRoomId());
        m.put("studentId", record.studentId());
        m.put("schoolId", record.schoolId());
        m.put("examId", record.examId());
        m.put("sessionId", record.sessionId());
        m.put("examName", record.examName());
        m.put("roomId", record.roomId());
        m.put("studentName", record.studentName());
        m.put("invigilatorName", record.invigilatorName());
        m.put("anomalyLabel", record.anomalyLabel());
        m.put("severity", record.severity());
        m.put("anomalyTsMs", record.anomalyTsMs());
        m.put("anomalyAt", Instant.ofEpochMilli(record.anomalyTsMs()).toString());
        m.put("mediaType", record.mediaType());
        m.put("frameCount", record.frameCount());
        m.put("mediaExt", record.mediaExt());
        m.put("mediaUrl", "/api/evidence/" + record.evidenceId() + "/media");
        return m;
    }

    private record FrameSnapshot(long tsMs, String mime, byte[] bytes) {}

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
            int frameCount) {}

    private record MediaSpec(String filePath, String mediaType, String mediaExt) {}
}
