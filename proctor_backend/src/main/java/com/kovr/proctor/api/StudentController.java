package com.kovr.proctor.api;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.kovr.proctor.domain.entity.StudentEntity;
import com.kovr.proctor.infra.mapper.DepartmentMapper;
import com.kovr.proctor.infra.mapper.ExamSessionMapper;
import com.kovr.proctor.infra.mapper.MajorMapper;
import com.kovr.proctor.infra.mapper.SchoolMapper;
import com.kovr.proctor.infra.mapper.StudentMapper;
import com.kovr.proctor.security.UserDetailsImpl;
import com.kovr.proctor.service.AnomalyClient;
import com.kovr.proctor.service.AnomalyEventService;
import com.kovr.proctor.service.ExamLiveStateService;
import com.kovr.proctor.service.FaceClient;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;
import com.fasterxml.jackson.core.type.TypeReference;


import java.util.*;

@RestController
@RequestMapping("/api/student")
@RequiredArgsConstructor
public class StudentController {
    private final StudentMapper sp;
    private final ExamSessionMapper examSessionMapper;
    private final ExamLiveStateService examLiveStateService;
    private final FaceClient faceClient;
    private final AnomalyClient anomalyClient;
    private final AnomalyEventService anomalyEventService;
    private final ObjectMapper om = new ObjectMapper();

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
        var cur = faceClient.extract(mime, bytes);

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
        Long roomId = roomIdNumber.longValue();
        byte[] bytes = photo.getBytes();
        String mime = Optional.ofNullable(photo.getContentType()).orElse("image/jpeg");
        examLiveStateService.putFrame(roomId, u.getId(), mime, bytes);
        long tsMs = System.currentTimeMillis();
        var events = anomalyClient.detect(roomId, u.getId(), bytes, mime, tsMs);
        anomalyEventService.mergeEvents(roomId, u.getId(), events);
        return Map.of("ok", true, "examRoomId", roomId, "size", bytes.length, "events", events);
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
        Long roomId = roomIdNumber.longValue();
        byte[] bytes = photo.getBytes();
        String mime = Optional.ofNullable(photo.getContentType()).orElse("image/jpeg");
        examLiveStateService.putFrame(roomId, u.getId(), mime, bytes);
        long tsMs = System.currentTimeMillis();
        var events = anomalyClient.detect(roomId, u.getId(), bytes, mime, tsMs);
        anomalyEventService.mergeEvents(roomId, u.getId(), events);
        return Map.of("ok", true, "examRoomId", roomId, "size", bytes.length, "events", events);
    }

}
