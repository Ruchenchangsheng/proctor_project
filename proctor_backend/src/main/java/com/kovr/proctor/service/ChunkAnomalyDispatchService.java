package com.kovr.proctor.service;

import com.kovr.proctor.infra.mapper.ExamRoomMapper;
import com.kovr.proctor.infra.mapper.StudentMapper;
import com.kovr.proctor.infra.mapper.UserMapper;
import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;

@Service
@RequiredArgsConstructor
@Slf4j
public class ChunkAnomalyDispatchService {
    private final AnomalyClient anomalyClient;
    private final AnomalyPolicyService anomalyPolicyService;
    private final AnomalyEventService anomalyEventService;
    private final AnomalyEvidenceService anomalyEvidenceService;
    private final StudentMapper studentMapper;
    private final ExamRoomMapper examRoomMapper;
    private final UserMapper userMapper;
    private final SimpMessagingTemplate messagingTemplate;

    private final BlockingQueue<ChunkTask> queue = new LinkedBlockingQueue<>();

    @Value("${anomaly.chunk.enabled:false}")
    private boolean chunkEnabled;

    @Value("${anomaly.chunk.log-enabled:true}")
    private boolean chunkLogEnabled;

    private volatile boolean workerRunning;
    private Thread workerThread;

    @PostConstruct
    void startWorker() {
        if (!chunkEnabled) {
            return;
        }
        workerRunning = true;
        workerThread = new Thread(this::runWorker, "chunk-anomaly-dispatch-worker");
        workerThread.setDaemon(true);
        workerThread.start();
    }

    @PreDestroy
    void stopWorker() {
        workerRunning = false;
        if (workerThread != null) {
            workerThread.interrupt();
        }
    }

    public void enqueue(
            Long roomId,
            Long studentId,
            Long schoolId,
            Map<String, Object> session,
            String fallbackStudentName,
            String filePath,
            String mime,
            long chunkStartTsMs,
            long chunkEndTsMs,
            String chunkId
    ) {
        if (!chunkEnabled || roomId == null || studentId == null || filePath == null || filePath.isBlank()) {
            return;
        }
        queue.offer(new ChunkTask(
                roomId,
                studentId,
                schoolId,
                session == null ? Map.of() : new LinkedHashMap<>(session),
                fallbackStudentName,
                filePath,
                mime,
                chunkStartTsMs,
                chunkEndTsMs,
                chunkId
        ));
        if (chunkLogEnabled) {
            log.info(
                    "chunk detect enqueued: roomId={}, studentId={}, chunkId={}, queueSize={}, startTsMs={}, endTsMs={}, filePath={}",
                    roomId,
                    studentId,
                    chunkId,
                    queue.size(),
                    chunkStartTsMs,
                    chunkEndTsMs,
                    filePath
            );
        }
    }

    private void runWorker() {
        while (workerRunning) {
            try {
                ChunkTask task = queue.poll(2, TimeUnit.SECONDS);
                if (task == null) {
                    continue;
                }
                process(task);
            } catch (InterruptedException ignore) {
                Thread.currentThread().interrupt();
                return;
            } catch (Exception ex) {
                log.warn("chunk anomaly worker tick failed: {}", ex.toString());
            }
        }
    }

    private void process(ChunkTask task) {
        AnomalyPolicyService.Policy policy = anomalyPolicyService.getPolicy(task.schoolId());
        long startedAt = System.currentTimeMillis();
        if (chunkLogEnabled) {
            log.info(
                    "chunk detect started: roomId={}, studentId={}, chunkId={}, queueSize={}, startTsMs={}, endTsMs={}",
                    task.roomId(),
                    task.studentId(),
                    task.chunkId(),
                    queue.size(),
                    task.chunkStartTsMs(),
                    task.chunkEndTsMs()
            );
        }
        List<Map<String, Object>> rawEvents = anomalyClient.detectChunk(
                task.roomId(),
                task.studentId(),
                task.filePath(),
                task.mime(),
                task.chunkStartTsMs(),
                task.chunkEndTsMs(),
                task.chunkId()
        );
        List<Map<String, Object>> enrichedEvents = enrichEvents(rawEvents, policy);
        if (enrichedEvents.isEmpty()) {
            if (chunkLogEnabled) {
                log.info(
                        "chunk detect finished without events: roomId={}, studentId={}, chunkId={}, costMs={}, rawEventCount={}",
                        task.roomId(),
                        task.studentId(),
                        task.chunkId(),
                        System.currentTimeMillis() - startedAt,
                        rawEvents == null ? 0 : rawEvents.size()
                );
            }
            return;
        }

        anomalyEventService.mergeEvents(task.roomId(), task.studentId(), enrichedEvents, policy.severeThreshold());
        List<Map<String, Object>> evidenceList = anomalyEvidenceService.captureEvidenceBatch(
                task.roomId(),
                task.studentId(),
                enrichedEvents,
                task.session(),
                loadStudentName(task.studentId(), task.fallbackStudentName()),
                loadInvigilatorName(task.roomId()),
                task.schoolId()
        );
        if (chunkLogEnabled) {
            log.info(
                    "chunk detect produced events: roomId={}, studentId={}, chunkId={}, costMs={}, labels={}, evidenceCount={}",
                    task.roomId(),
                    task.studentId(),
                    task.chunkId(),
                    System.currentTimeMillis() - startedAt,
                    summarizeLabels(enrichedEvents),
                    evidenceList == null ? 0 : evidenceList.size()
            );
        }
        pushAnomalyUpdate(task.roomId(), task.studentId(), enrichedEvents, evidenceList, policy);
    }

    private String summarizeLabels(List<Map<String, Object>> events) {
        if (events == null || events.isEmpty()) {
            return "";
        }
        List<String> labels = new ArrayList<>();
        for (Map<String, Object> event : events) {
            labels.add(String.valueOf(event.getOrDefault("label", "unknown")));
        }
        return String.join(",", labels);
    }

    private String loadStudentName(Long studentUserId, String fallback) {
        var profile = studentMapper.selectStudentProfileByUserId(studentUserId);
        if (profile == null) {
            return fallback;
        }
        Object studentName = profile.get("name");
        return studentName == null ? fallback : String.valueOf(studentName);
    }

    private String loadInvigilatorName(Long roomId) {
        var room = examRoomMapper.selectById(roomId);
        if (room == null || room.getInvigilatorId() == null) {
            return null;
        }
        var user = userMapper.selectById(room.getInvigilatorId());
        return user == null ? null : user.getName();
    }

    private List<Map<String, Object>> enrichEvents(List<Map<String, Object>> events, AnomalyPolicyService.Policy policy) {
        if (events == null || events.isEmpty()) {
            return List.of();
        }
        List<Map<String, Object>> out = new ArrayList<>();
        for (Map<String, Object> event : events) {
            Map<String, Object> item = new LinkedHashMap<>(event);
            double probability = toDouble(item.get("score"));
            if (probability < policy.warningThreshold()) {
                continue;
            }
            String violationType = String.valueOf(item.getOrDefault("label", "unknown"));
            item.put("probability", probability);
            item.put("violationType", violationType);
            item.put("violationCode", mapViolationCode(violationType));
            item.put("severity", probability >= policy.severeThreshold() ? "SEVERE" : "WARNING");
            out.add(item);
        }
        return out;
    }

    private double toDouble(Object value) {
        if (value instanceof Number n) {
            return n.doubleValue();
        }
        try {
            return Double.parseDouble(String.valueOf(value));
        } catch (Exception ignore) {
            return 0d;
        }
    }

    private int mapViolationCode(String label) {
        if (label == null) return 9999;
        return switch (label) {
            case "face_not_visible" -> 1001;
            case "multi_face" -> 1003;
            case "look_left", "look_right", "look_offscreen" -> 2002;
            case "look_down" -> 2003;
            case "talking" -> 2004;
            case "other_person_present" -> 2005;
            case "other_limb_present" -> 2006;
            case "leave_seat" -> 2007;
            default -> 9000;
        };
    }

    private void pushAnomalyUpdate(
            Long roomId,
            Long studentId,
            List<Map<String, Object>> events,
            List<Map<String, Object>> evidences,
            AnomalyPolicyService.Policy policy
    ) {
        if (events == null || events.isEmpty()) {
            return;
        }
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("type", "anomaly-update");
        payload.put("roomId", roomId);
        payload.put("studentId", studentId);
        payload.put("events", events);
        payload.put("evidences", evidences);
        payload.put("active", anomalyEventService.listActiveStates(roomId));
        payload.put("history", anomalyEventService.listRoomEvents(roomId));
        payload.put("policy", anomalyPolicyService.asMap(policy));
        messagingTemplate.convertAndSend("/topic/exam-room." + roomId, payload);
    }

    private record ChunkTask(
            Long roomId,
            Long studentId,
            Long schoolId,
            Map<String, Object> session,
            String fallbackStudentName,
            String filePath,
            String mime,
            long chunkStartTsMs,
            long chunkEndTsMs,
            String chunkId
    ) {}
}
