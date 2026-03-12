package com.kovr.proctor.api;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.kovr.proctor.common.BusinessException;
import com.kovr.proctor.domain.entity.StudentEntity;
import com.kovr.proctor.infra.mapper.ExamRoomMapper;
import com.kovr.proctor.infra.mapper.ExamSessionMapper;
import com.kovr.proctor.infra.mapper.StudentMapper;
import com.kovr.proctor.infra.mapper.UserMapper;
import com.kovr.proctor.security.UserDetailsImpl;
import com.kovr.proctor.service.*;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;
import com.fasterxml.jackson.core.type.TypeReference;
import org.springframework.messaging.simp.SimpMessagingTemplate;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

@RestController
@RequestMapping("/api/student")
@RequiredArgsConstructor
public class StudentController {
    private final StudentMapper sp;
    private final ExamSessionMapper examSessionMapper;
    private final ExamRoomMapper examRoomMapper;
    private final UserMapper userMapper;
    private final ExamLiveStateService examLiveStateService;
    private final FaceClient faceClient;
    private final AnomalyClient anomalyClient;
    private final AnomalyEventService anomalyEventService;
    private final AnomalyPolicyService anomalyPolicyService;
    private final AnomalyEvidenceService anomalyEvidenceService;
    private final SimpMessagingTemplate messagingTemplate;
    private final ObjectMapper om = new ObjectMapper();
    private final ConcurrentHashMap<String, Long> lastAnomalyAt = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, Long> lastIdentityAt = new ConcurrentHashMap<>();

    @Value("${app.face.verify.threshold:0.35}")
    double verifyThreshold;

    @Value("${app.face.min_det_score:0.5}")
    double minDetScore;

    @GetMapping("/profile")
    @PreAuthorize("hasRole('STUDENT')")
    public Map<String, Object> profile(@AuthenticationPrincipal UserDetailsImpl u) {
        Map<String,Object> m = sp.selectStudentProfileByUserId(u.getId());
        if (m == null) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Student profile not found");
        }
        return m; // { id, name, email, schoolName, departmentName, majorName }
    }

    @GetMapping(value = "/photo", produces = MediaType.ALL_VALUE)
    @PreAuthorize("hasRole('STUDENT')")
    public ResponseEntity<byte[]> photo(@AuthenticationPrincipal UserDetailsImpl u) {
        StudentEntity s = sp.selectById(u.getId()); // 主键= user_id（确保 StudentEntity 有 @TableId(value="user_id")）
        if (s == null || s.getFacePhoto() == null || s.getFacePhoto().length == 0) {
            return ResponseEntity.noContent().build();
        }

        byte[] bytes = s.getFacePhoto();

        // 1) 兜底并净化 mime
        String dbMime = (s.getFacePhotoMime() == null) ? "" : s.getFacePhotoMime().trim();
        MediaType ct = MediaType.IMAGE_JPEG; // 默认
        if (!dbMime.isEmpty()) {
            try {
                MediaType parsed = MediaType.parseMediaType(dbMime);
                if ("image".equalsIgnoreCase(parsed.getType())) {
                    ct = parsed; // 只接受 image/*
                }
            } catch (Exception ignore) {
                // 非法 mime，保持默认 image/jpeg
            }
        }

        // 2) 文件扩展名（纯装饰，不影响展示）
        String ext = (ct.getSubtype() != null && !ct.getSubtype().isBlank()) ? ct.getSubtype() : "jpg";
        String filename = "photo." + ext.replaceAll("[^a-zA-Z0-9]", "");

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(ct);
        headers.setContentLength(bytes.length);
        headers.setCacheControl(CacheControl.noCache().cachePrivate());
        headers.set(HttpHeaders.CONTENT_DISPOSITION, "inline; filename=\"" + filename + "\"");

        return new ResponseEntity<>(bytes, headers, HttpStatus.OK);
    }

    /** 考前 1:1 人脸验证（上传当前帧，与注册照比对） */
    @PostMapping(value = "/verify", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @PreAuthorize("hasRole('STUDENT')")
    public Map<String, Object> verify(@AuthenticationPrincipal UserDetailsImpl u,
                                      @RequestPart("photo") MultipartFile photo) throws Exception {
        var stu = sp.selectById(u.getId());
        if (stu == null || stu.getFaceEmbeddingJson() == null || stu.getFaceEmbeddingJson().isBlank()) {
            return Map.of("ok", false, "passed", false, "msg", "未登记人脸，请联系学校管理员");
        }

        // 解析库里 embedding
        double[] reg = jsonToVector(stu.getFaceEmbeddingJson());
        if (reg.length == 0) {
            return Map.of("ok", false, "passed", false, "msg", "注册人脸数据异常");
        }

        // 提取当前帧 embedding
        byte[] bytes = photo.getBytes();
        String mime = Optional.ofNullable(photo.getContentType()).orElse("image/jpeg");
        FaceClient.FaceInfo cur;
        try {
            cur = faceClient.extract(mime, bytes);
        } catch (BusinessException ex) {
            String msg = "当前照片无法完成人脸特征提取，请确认正脸入镜、光线充足后重试";
            if ("FACE_SERVICE_UNAVAILABLE".equals(ex.getCode())) {
                msg = "人脸服务暂时不可用，请稍后重试";
            }
            return Map.of(
                    "ok", false,
                    "passed", false,
                    "msg", msg
            );
        }

        // 质量门控（det_score）
        double det = cur.getScore();
        if (det < minDetScore) {
            return Map.of(
                    "ok", true, "passed", false,
                    "msg", "人脸质量过低，请调整光照/位置后重试",
                    "detScore", det, "minDetScore", minDetScore
            );
        }

        // 比对相似度
        double[] probe = jsonToVector(cur.getJson());
        double cos = cosine(reg, probe);
        boolean passed = cos >= verifyThreshold;

        Map<String, Object> res = new LinkedHashMap<>();
        res.put("ok", true);
        res.put("passed", passed);
        res.put("score", cos);
        res.put("threshold", verifyThreshold);
        res.put("detScore", det);
        res.put("minDetScore", minDetScore);
        res.put("msg", passed ? "验证通过" : "验证未通过，请重试");
        return res;
    }

    // ===== 工具方法 =====
    private double[] jsonToVector(String json) throws Exception {
        if (json == null || json.isBlank()) return new double[0];
        List<Double> list = om.readValue(json, new TypeReference<List<Double>>() {});
        double[] v = new double[list.size()];
        for (int i = 0; i < list.size(); i++) v[i] = list.get(i);
        return v;
    }

    private double cosine(double[] a, double[] b) {
        if (a.length == 0 || b.length == 0 || a.length != b.length) return -1.0;
        double dot = 0, na = 0, nb = 0;
        for (int i = 0; i < a.length; i++) {
            dot += a[i] * b[i];
            na += a[i] * a[i];
            nb += b[i] * b[i];
        }
        double denom = Math.sqrt(na) * Math.sqrt(nb);
        return denom == 0 ? -1.0 : (dot / denom);
    }

    @GetMapping("/current-room")
    @PreAuthorize("hasRole('STUDENT')")
    public Map<String, Object> currentRoom(@AuthenticationPrincipal UserDetailsImpl u) {
        try {
            Map<String, Object> session = examSessionMapper.selectCurrentSessionByStudentId(u.getId());
            if (session == null) {
                return Map.of("hasRoom", false, "msg", "当前未分配考试房间");
            }
            Map<String, Object> res = new LinkedHashMap<>(session);
            res.put("hasRoom", true);
            return res;
        } catch (Exception ex) {
            return Map.of("hasRoom", false, "msg", "查询考试房间失败，请稍后重试");
        }
    }

    @GetMapping("/exams")
    @PreAuthorize("hasRole('STUDENT')")
    public List<Map<String, Object>> myExams(@AuthenticationPrincipal UserDetailsImpl u) {
        try {
            return examSessionMapper.selectSessionsByStudentId(u.getId());
        } catch (Exception ex) {
            return List.of();
        }
    }

    @GetMapping("/exams/{sessionId}/room")
    @PreAuthorize("hasRole('STUDENT')")
    public Map<String, Object> sessionRoom(@AuthenticationPrincipal UserDetailsImpl u,
                                           @PathVariable Long sessionId) {
        try {
            Map<String, Object> session = examSessionMapper.selectSessionRoomByStudentAndSessionId(u.getId(), sessionId);
            if (session == null) {
                return Map.of("hasRoom", false, "msg", "未找到该考试场次或无权限");
            }
            String status = String.valueOf(session.getOrDefault("sessionStatus", ""));
            if ("FINISHED".equalsIgnoreCase(status)) {
                return Map.of("hasRoom", false, "ended", true, "msg", "该场考试已结束，无法再次进入");
            }
            Map<String, Object> res = new LinkedHashMap<>(session);
            res.put("hasRoom", true);
            return res;
        } catch (Exception ex) {
            return Map.of("hasRoom", false, "msg", "查询考试房间失败，请稍后重试");
        }
    }

    @PostMapping(value = "/current-room/frame", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @PreAuthorize("hasRole('STUDENT')")
    public Map<String, Object> uploadFrame(@AuthenticationPrincipal UserDetailsImpl u,
                                           @RequestPart("photo") MultipartFile photo) throws Exception {
        Map<String, Object> session;
        try {
            session = examSessionMapper.selectCurrentSessionByStudentId(u.getId());
        } catch (Exception ex) {
            return Map.of("ok", false, "msg", "查询考试房间失败，请稍后重试");
        }
        if (session == null || !(session.get("examRoomId") instanceof Number roomIdNumber)) {
            return Map.of("ok", false, "msg", "当前未分配考试房间");
        }
        if (!isSessionRunning(session)) {
            autoFinishSession(session,"TIME_UP");
            return Map.of("ok", false, "ended", true, "autoSubmitted", true, "msg", "考试已结束，系统已自动交卷并退出");
        }
        Long roomId = roomIdNumber.longValue();
        byte[] bytes = photo.getBytes();
        String mime = Optional.ofNullable(photo.getContentType()).orElse("image/jpeg");
        examLiveStateService.putFrame(roomId, u.getId(), mime, bytes);
        anomalyEvidenceService.bufferFrame(roomId, u.getId(), mime, bytes, System.currentTimeMillis());
        long tsMs = System.currentTimeMillis();

        var policy = anomalyPolicyService.getPolicy(loadSchoolId(u.getId()));
        var enrichedEvents = processFrame(roomId, u.getId(), bytes, mime, tsMs, policy);
        if (!enrichedEvents.isEmpty()) {
            anomalyEventService.mergeEvents(roomId, u.getId(), enrichedEvents, policy.severeThreshold());

            var evidenceList = anomalyEvidenceService.captureEvidenceBatch(
                    roomId,
                    u.getId(),
                    enrichedEvents,
                    session,
                    loadStudentName(u.getId(), u.getName()),
                    loadInvigilatorName(roomId),
                    loadSchoolId(u.getId()));
            pushAnomalyUpdate(roomId, u.getId(), enrichedEvents, evidenceList, policy);
        }
        return Map.of("ok", true, "examRoomId", roomId, "size", bytes.length, "events", enrichedEvents);

    }

    @PostMapping(value = "/exams/{sessionId}/frame", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @PreAuthorize("hasRole('STUDENT')")
    public Map<String, Object> uploadFrameBySession(@AuthenticationPrincipal UserDetailsImpl u,
                                                    @PathVariable Long sessionId,
                                                    @RequestPart("photo") MultipartFile photo) throws Exception {
        Map<String, Object> session;
        try {
            session = examSessionMapper.selectSessionRoomByStudentAndSessionId(u.getId(), sessionId);
        } catch (Exception ex) {
            return Map.of("ok", false, "msg", "查询考试房间失败，请稍后重试");
        }
        if (session == null || !(session.get("examRoomId") instanceof Number roomIdNumber)) {
            return Map.of("ok", false, "msg", "当前未分配考试房间");
        }
        if (!isSessionRunning(session)) {
            autoFinishSession(session,"TIME_UP");
            return Map.of("ok", false, "ended", true, "autoSubmitted", true, "msg", "考试已结束，系统已自动交卷并退出");
        }
        Long roomId = roomIdNumber.longValue();
        byte[] bytes = photo.getBytes();
        String mime = Optional.ofNullable(photo.getContentType()).orElse("image/jpeg");
        examLiveStateService.putFrame(roomId, u.getId(), mime, bytes);
        anomalyEvidenceService.bufferFrame(roomId, u.getId(), mime, bytes, System.currentTimeMillis());
        long tsMs = System.currentTimeMillis();

        var policy = anomalyPolicyService.getPolicy(loadSchoolId(u.getId()));
        var enrichedEvents = processFrame(roomId, u.getId(), bytes, mime, tsMs, policy);
        if (!enrichedEvents.isEmpty()) {
            anomalyEventService.mergeEvents(roomId, u.getId(), enrichedEvents, policy.severeThreshold());
            var evidenceList = anomalyEvidenceService.captureEvidenceBatch(
                    roomId,
                    u.getId(),
                    enrichedEvents,
                    session,
                    loadStudentName(u.getId(), u.getName()),
                    loadInvigilatorName(roomId),
                    loadSchoolId(u.getId()));
            pushAnomalyUpdate(roomId, u.getId(), enrichedEvents, evidenceList, policy);
        }
        return Map.of("ok", true, "examRoomId", roomId, "size", bytes.length, "events", enrichedEvents);
    }

    @GetMapping("/exams/{sessionId}/heartbeat")
    @PreAuthorize("hasRole('STUDENT')")
    public Map<String, Object> heartbeat(@AuthenticationPrincipal UserDetailsImpl u,
                                         @PathVariable Long sessionId) {
        Map<String, Object> session = examSessionMapper.selectSessionRoomByStudentAndSessionId(u.getId(), sessionId);
        if (session == null) {
            return Map.of("ok", false, "ended", true, "msg", "考试场次不存在或无权限");
        }
        boolean running = isSessionRunning(session);
        String status = String.valueOf(session.getOrDefault("sessionStatus", ""));
        if (!running || "FINISHED".equalsIgnoreCase(status)) {
            autoFinishSession(session, "TIME_UP");
            return Map.of("ok", true, "ended", true, "msg", "考试已结束");
        }
        return Map.of("ok", true, "ended", false);
    }

    @PostMapping("/exams/{sessionId}/submit")
    @PreAuthorize("hasRole('STUDENT')")
    public Map<String, Object> submitExam(@AuthenticationPrincipal UserDetailsImpl u,
                                          @PathVariable Long sessionId) {
        Map<String, Object> session = examSessionMapper.selectSessionRoomByStudentAndSessionId(u.getId(), sessionId);
        if (session == null) {
            return Map.of("ok", false, "msg", "考试场次不存在或无权限");
        }
        autoFinishSession(session, "SUBMITTED");
        return Map.of("ok", true, "ended", true, "msg", "已交卷并退出考试");
    }

    @PostMapping("/exams/{sessionId}/abnormal-exit")
    @PreAuthorize("hasRole('STUDENT')")
    public Map<String, Object> abnormalExit(@AuthenticationPrincipal UserDetailsImpl u,
                                            @PathVariable Long sessionId) {
        Map<String, Object> session = examSessionMapper.selectSessionRoomByStudentAndSessionId(u.getId(), sessionId);
        if (session == null) {
            return Map.of("ok", false, "msg", "考试场次不存在或无权限");
        }
        examSessionMapper.markAbnormalExit(sessionId);
        return Map.of("ok", true);
    }

    private List<Map<String, Object>> processFrame(Long roomId, Long studentId, byte[] bytes, String mime, long tsMs, AnomalyPolicyService.Policy policy) {
        List<Map<String, Object>> merged = new ArrayList<>();
        String key = roomId + ":" + studentId;

        long lastAnomaly = lastAnomalyAt.getOrDefault(key, 0L);
        if (tsMs - lastAnomaly >= policy.sampleIntervalMs()) {
            var events = anomalyClient.detect(roomId, studentId, bytes, mime, tsMs);
            merged.addAll(enrichEvents(events, policy));
            lastAnomalyAt.put(key, tsMs);
        }

        long lastIdentity = lastIdentityAt.getOrDefault(key, 0L);
        if (tsMs - lastIdentity >= policy.identityVerifyIntervalSec() * 1000L) {
            Map<String, Object> identityEvent = checkIdentityEvent(studentId, tsMs, bytes, mime, policy);
            if (identityEvent != null) {
                merged.add(identityEvent);
            }
            lastIdentityAt.put(key, tsMs);
        }

        return merged;
    }

    private Map<String, Object> checkIdentityEvent(Long studentId, long tsMs, byte[] bytes, String mime, AnomalyPolicyService.Policy policy) {
        var student = sp.selectById(studentId);
        if (student == null || student.getFaceEmbeddingJson() == null || student.getFaceEmbeddingJson().isBlank()) {
            return null;
        }
        try {
            var current = faceClient.extract(mime, bytes);
            if (current.getFaceCount() > 1) {
                return buildIdentityEvent("multiple_face_detected", tsMs, 0.99d, policy);
            }
            double[] reg = jsonToVector(student.getFaceEmbeddingJson());
            double[] cur = jsonToVector(current.getJson());
            double cosine = cosine(reg, cur);
            double risk = Math.max(0d, 1d - cosine);
            if (cosine >= verifyThreshold) {
                return null;
            }
            return buildIdentityEvent("identity_not_match", tsMs, risk, policy);
        } catch (BusinessException ex) {
            return buildIdentityEvent("identity_face_missing", tsMs, 0.99d, policy);
        } catch (Exception ex) {
            return buildIdentityEvent("identity_check_error", tsMs, 0.9d, policy);
        }
    }

    private Map<String, Object> buildIdentityEvent(String label, long tsMs, double risk, AnomalyPolicyService.Policy policy) {
        if (risk < policy.warningThreshold()) {
            return null;
        }
        Map<String, Object> item = new LinkedHashMap<>();
        item.put("type", "identity_check");
        item.put("label", label);
        item.put("violationType", label);
        item.put("ts_ms", tsMs);
        item.put("score", risk);
        item.put("probability", risk);
        item.put("severity", risk >= policy.severeThreshold() ? "SEVERE" : "WARNING");
        return item;
    }

    private void autoFinishSession(Map<String, Object> session) {
        autoFinishSession(session, "TIME_UP");
    }

    private void autoFinishSession(Map<String, Object> session, String reason) {
        if (session == null) return;
        Object sid = session.get("sessionId");
        if (sid instanceof Number n) {
            examSessionMapper.finishSessionWithReason(n.longValue(), reason == null ? "TIME_UP" : reason);
        }
    }

    private boolean isSessionRunning(Map<String, Object> session) {
        LocalDateTime now = LocalDateTime.now();
        LocalDateTime startAt = parseDateTime(session.get("startAt"));
        LocalDateTime endAt = parseDateTime(session.get("endAt"));
        if (startAt != null && now.isBefore(startAt)) {
            return false;
        }
        if (endAt != null && now.isAfter(endAt)) {
            return false;
        }
        return true;
    }

    private LocalDateTime parseDateTime(Object value) {
        if (value == null) return null;
        try {
            return LocalDateTime.parse(String.valueOf(value), DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));
        } catch (Exception ex) {
            return null;
        }
    }

    private Long loadSchoolId(Long studentUserId) {
        var student = sp.selectById(studentUserId);
        return student == null ? null : student.getSchoolId();
    }

    private String loadInvigilatorName(Long roomId) {
        var room = examRoomMapper.selectById(roomId);
        if (room == null || room.getInvigilatorId() == null) {
            return null;
        }
        var user = userMapper.selectById(room.getInvigilatorId());
        return user == null ? null : user.getName();
    }

    private String loadStudentName(Long studentUserId, String fallback) {
        var profile = sp.selectStudentProfileByUserId(studentUserId);
        if (profile == null) {
            return fallback;
        }
        Object studentName = profile.get("name");
        return studentName == null ? fallback : String.valueOf(studentName);
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
            case "identity_face_missing" -> 1001;
            case "identity_not_match" -> 1002;
            case "multiple_face_detected" -> 1003;
            case "identity_check_error" -> 1099;
            case "abnormal_posture" -> 2001;
            case "look_left_right", "abnormal_look_around" -> 2002;
            case "head_down", "abnormal_head_down" -> 2003;
            default -> 9000;
        };
    }

    private void pushAnomalyUpdate(Long roomId, Long studentId, List<Map<String, Object>> events, List<Map<String, Object>> evidences, AnomalyPolicyService.Policy policy) {
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

}