package com.kovr.proctor.api;

import com.kovr.proctor.infra.mapper.ExamRoomMapper;
import com.kovr.proctor.infra.mapper.SchoolAdminMapper;
import com.kovr.proctor.security.UserDetailsImpl;
import com.kovr.proctor.service.AnomalyEvidenceService;
import lombok.RequiredArgsConstructor;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/evidence")
@RequiredArgsConstructor
public class EvidenceController {
    private final AnomalyEvidenceService anomalyEvidenceService;
    private final ExamRoomMapper examRoomMapper;
    private final SchoolAdminMapper schoolAdminMapper;

    @GetMapping("/rooms/{examRoomId}")
    @PreAuthorize("hasRole('TEACHER')")
    public Map<String, Object> listByRoom(
            @AuthenticationPrincipal UserDetailsImpl u,
            @PathVariable Long examRoomId) {
        Map<String, Object> room = examRoomMapper.selectOwnedRoomByTeacher(examRoomId, u.getId());
        if (room == null) {
            return Map.of("ok", false, "msg", "未找到该监考房间或无权限");
        }
        return Map.of("ok", true, "items", anomalyEvidenceService.listByRoom(examRoomId));
    }

    @GetMapping("/school/{schoolId}")
    @PreAuthorize("hasRole('SCHOOL_ADMIN')")
    public Map<String, Object> listBySchool(
            @AuthenticationPrincipal UserDetailsImpl u,
            @PathVariable Long schoolId) {
        var admin = schoolAdminMapper.selectById(u.getId());
        if (admin == null || !schoolId.equals(admin.getSchoolId())) {
            return Map.of("ok", false, "msg", "无权限访问该学校证据");
        }
        return Map.of("ok", true, "items", anomalyEvidenceService.listBySchool(schoolId));
    }

    @GetMapping("/all")
    @PreAuthorize("hasRole('ADMIN')")
    public Map<String, Object> listAll() {
        return Map.of("ok", true, "items", anomalyEvidenceService.listAll());
    }

    @GetMapping("/{evidenceId}")
    @PreAuthorize("hasAnyRole('TEACHER','SCHOOL_ADMIN','ADMIN')")
    public Map<String, Object> getEvidence(
            @AuthenticationPrincipal UserDetailsImpl u,
            @PathVariable String evidenceId) {
        Map<String, Object> evidence = anomalyEvidenceService.getEvidence(evidenceId);
        if (evidence == null) {
            return Map.of("ok", false, "msg", "证据不存在");
        }
        if (!canView(u, evidence)) {
            return Map.of("ok", false, "msg", "无权限访问该证据");
        }
        return Map.of("ok", true, "item", evidence);
    }

    @GetMapping("/{evidenceId}/media")
    @PreAuthorize("hasAnyRole('TEACHER','SCHOOL_ADMIN','ADMIN')")
    public ResponseEntity<Resource> media(
            @AuthenticationPrincipal UserDetailsImpl u,
            @PathVariable String evidenceId,
            @RequestParam(defaultValue = "inline") String disposition) {
        Map<String, Object> evidence = anomalyEvidenceService.getEvidence(evidenceId);
        if (evidence == null || !canView(u, evidence)) {
            return ResponseEntity.notFound().build();
        }
        Resource media = anomalyEvidenceService.loadMedia(evidenceId);
        if (media == null) {
            return ResponseEntity.notFound().build();
        }
        String mediaType = String.valueOf(evidence.getOrDefault("mediaType", MediaType.APPLICATION_OCTET_STREAM_VALUE));
        String ext = String.valueOf(evidence.getOrDefault("mediaExt", "gif"));
        String fileName = evidenceId + "." + ext;
        String contentDisposition = ("attachment".equalsIgnoreCase(disposition) ? "attachment" : "inline") + "; filename=\"" + fileName + "\"";
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, contentDisposition)
                .contentType(MediaType.parseMediaType(mediaType))
                .body(media);
    }

    private boolean canView(UserDetailsImpl user, Map<String, Object> evidence) {
        if (user == null || evidence == null) {
            return false;
        }
        String role = user.getRole();
        if ("ADMIN".equals(role)) {
            return true;
        }
        if ("TEACHER".equals(role)) {
            Object roomIdObj = evidence.get("examRoomId");
            if (!(roomIdObj instanceof Number roomIdNumber)) {
                return false;
            }
            return examRoomMapper.selectOwnedRoomByTeacher(roomIdNumber.longValue(), user.getId()) != null;
        }
        if ("SCHOOL_ADMIN".equals(role)) {
            var admin = schoolAdminMapper.selectById(user.getId());
            if (admin == null) {
                return false;
            }
            Object schoolIdObj = evidence.get("schoolId");
            if (!(schoolIdObj instanceof Number schoolIdNumber)) {
                return false;
            }
            return Long.valueOf(schoolIdNumber.longValue()).equals(admin.getSchoolId());
        }
        return false;
    }
}
