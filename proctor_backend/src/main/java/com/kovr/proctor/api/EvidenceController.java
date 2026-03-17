package com.kovr.proctor.api;

import com.kovr.proctor.api.dto.EvidenceExportReq;
import com.kovr.proctor.api.dto.ReviewEvidenceReq;
import com.kovr.proctor.service.AuditLogService;
import com.kovr.proctor.infra.mapper.ExamRoomMapper;
import com.kovr.proctor.infra.mapper.SchoolAdminMapper;
import com.kovr.proctor.security.UserDetailsImpl;
import com.kovr.proctor.service.AnomalyEvidenceService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;

import java.io.BufferedWriter;
import java.io.OutputStreamWriter;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;
/**
 * EvidenceController 提供异常证据的查询、媒体下载、审核和导出能力。
 */

@RestController
@RequestMapping("/api/evidence")
@RequiredArgsConstructor
public class EvidenceController {
    private final AnomalyEvidenceService anomalyEvidenceService;
    private final ExamRoomMapper examRoomMapper;
    private final SchoolAdminMapper schoolAdminMapper;
    private final AuditLogService auditLogService;

    /**
     * 读取或查询当前业务场景下需要的数据。
     * 阅读这个方法时，可以重点关注它读取了哪些输入、修改了哪些状态，以及异常或边界条件如何处理。
     */
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

    /**
     * 读取或查询当前业务场景下需要的数据。
     * 阅读这个方法时，可以重点关注它读取了哪些输入、修改了哪些状态，以及异常或边界条件如何处理。
     */
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

    /**
     * 读取或查询当前业务场景下需要的数据。
     * 阅读这个方法时，可以重点关注它读取了哪些输入、修改了哪些状态，以及异常或边界条件如何处理。
     */
    @GetMapping("/all")
    @PreAuthorize("hasRole('ADMIN')")
    public Map<String, Object> listAll() {
        return Map.of("ok", true, "items", anomalyEvidenceService.listAll());
    }

    /**
     * 读取或查询当前业务场景下需要的数据。
     * 阅读这个方法时，可以重点关注它读取了哪些输入、修改了哪些状态，以及异常或边界条件如何处理。
     */
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
        anomalyEvidenceService.markViewed(evidenceId);
        auditLogService.logCurrent("EVIDENCE_VIEW", "EVIDENCE", evidenceId, "查看作弊证据", buildEvidenceSummary(evidence));
        return Map.of("ok", true, "item", evidence);
    }

    /**
     * 封装当前类中的一段独立业务步骤，减少调用方直接处理过多细节。
     * 阅读这个方法时，可以重点关注它读取了哪些输入、修改了哪些状态，以及异常或边界条件如何处理。
     */
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
        anomalyEvidenceService.markViewed(evidenceId);
        Resource media = anomalyEvidenceService.loadMedia(evidenceId);
        if (media == null) {
            return ResponseEntity.notFound().build();
        }
        String mediaType = String.valueOf(evidence.getOrDefault("mediaType", MediaType.APPLICATION_OCTET_STREAM_VALUE));
        String ext = String.valueOf(evidence.getOrDefault("mediaExt", "mp4"));
        String fileName = evidenceId + "." + ext;
        String contentDisposition = ("attachment".equalsIgnoreCase(disposition) ? "attachment" : "inline") + "; filename=\"" + fileName + "\"";
        auditLogService.logCurrent(
                "attachment".equalsIgnoreCase(disposition) ? "EVIDENCE_DOWNLOAD" : "EVIDENCE_PREVIEW",
                "EVIDENCE",
                evidenceId,
                "attachment".equalsIgnoreCase(disposition) ? "下载作弊证据" : "预览作弊证据",
                buildEvidenceSummary(evidence));
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, contentDisposition)
                .contentType(MediaType.parseMediaType(mediaType))
                .body(media);
    }

    /**
     * 封装当前类中的一段独立业务步骤，减少调用方直接处理过多细节。
     * 阅读这个方法时，可以重点关注它读取了哪些输入、修改了哪些状态，以及异常或边界条件如何处理。
     */
    @PostMapping("/{evidenceId}/review")
    @PreAuthorize("hasAnyRole('TEACHER','SCHOOL_ADMIN','ADMIN')")
    public Map<String, Object> reviewEvidence(
            @AuthenticationPrincipal UserDetailsImpl u,
            @PathVariable String evidenceId,
            @RequestBody @Valid ReviewEvidenceReq req) {
        Map<String, Object> evidence = anomalyEvidenceService.getEvidence(evidenceId);
        if (evidence == null) {
            return Map.of("ok", false, "msg", "证据不存在");
        }
        if (!canView(u, evidence)) {
            return Map.of("ok", false, "msg", "无权限处理该证据");
        }
        String normalizedStatus = normalizeReviewStatus(req.reviewStatus());
        Map<String, Object> item = anomalyEvidenceService.updateReview(evidenceId, normalizedStatus, normalizeText(req.reviewNote()), u.getId(), u.getName());
        auditLogService.logCurrent("EVIDENCE_REVIEW", "EVIDENCE", evidenceId, "处理作弊证据", normalizedStatus + " ｜ " + buildEvidenceSummary(evidence));
        return Map.of("ok", true, "item", item);
    }

    /**
     * 封装当前类中的一段独立业务步骤，减少调用方直接处理过多细节。
     * 阅读这个方法时，可以重点关注它读取了哪些输入、修改了哪些状态，以及异常或边界条件如何处理。
     */
    @GetMapping("/{evidenceId}/report")
    @PreAuthorize("hasAnyRole('TEACHER','SCHOOL_ADMIN','ADMIN')")
    public ResponseEntity<String> report(
            @AuthenticationPrincipal UserDetailsImpl u,
            @PathVariable String evidenceId) {
        Map<String, Object> evidence = anomalyEvidenceService.getEvidence(evidenceId);
        if (evidence == null || !canView(u, evidence)) {
            return ResponseEntity.notFound().build();
        }
        auditLogService.logCurrent("EVIDENCE_REPORT", "EVIDENCE", evidenceId, "导出证据处理报告", buildEvidenceSummary(evidence));
        String fileName = "evidence-report-" + evidenceId + ".txt";
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + fileName + "\"")
                .contentType(MediaType.TEXT_PLAIN)
                .body(buildEvidenceReport(evidence));
    }

    /**
     * 封装当前类中的一段独立业务步骤，减少调用方直接处理过多细节。
     * 阅读这个方法时，可以重点关注它读取了哪些输入、修改了哪些状态，以及异常或边界条件如何处理。
     */
    @PostMapping(value = "/export-list", produces = "text/csv")
    @PreAuthorize("hasAnyRole('TEACHER','SCHOOL_ADMIN','ADMIN')")
    public ResponseEntity<String> exportList(
            @AuthenticationPrincipal UserDetailsImpl u,
            @RequestBody EvidenceExportReq req) {
        List<Map<String, Object>> evidences = resolveAccessibleEvidences(u, req);
        StringBuilder csv = new StringBuilder();
        csv.append('\uFEFF');
        csv.append("evidenceId,examName,studentName,roomId,severity,anomalyLabel,reviewStatus,reviewedByName,reviewedAt\n");
        for (Map<String, Object> item : evidences) {
            csv.append(csv(item.get("evidenceId"))).append(',')
                    .append(csv(item.get("examName"))).append(',')
                    .append(csv(item.get("studentName"))).append(',')
                    .append(csv(item.get("roomId"))).append(',')
                    .append(csv(item.get("severity"))).append(',')
                    .append(csv(item.get("anomalyLabel"))).append(',')
                    .append(csv(item.get("reviewStatus"))).append(',')
                    .append(csv(item.get("reviewedByName"))).append(',')
                    .append(csv(item.get("reviewedAt"))).append('\n');
        }
        auditLogService.logCurrent("EVIDENCE_EXPORT", "EVIDENCE_LIST", String.valueOf(evidences.size()), "导出证据列表", "数量：" + evidences.size());
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"evidence-list.csv\"")
                .contentType(MediaType.parseMediaType("text/csv;charset=UTF-8"))
                .body(csv.toString());
    }

    /**
     * 封装当前类中的一段独立业务步骤，减少调用方直接处理过多细节。
     * 阅读这个方法时，可以重点关注它读取了哪些输入、修改了哪些状态，以及异常或边界条件如何处理。
     */
    @PostMapping(value = "/export-zip", produces = "application/zip")
    @PreAuthorize("hasAnyRole('TEACHER','SCHOOL_ADMIN','ADMIN')")
    public ResponseEntity<StreamingResponseBody> exportZip(
            @AuthenticationPrincipal UserDetailsImpl u,
            @RequestBody EvidenceExportReq req) {
        List<Map<String, Object>> evidences = resolveAccessibleEvidences(u, req);
        StreamingResponseBody body = outputStream -> {
            try (ZipOutputStream zip = new ZipOutputStream(outputStream, StandardCharsets.UTF_8)) {
                zip.putNextEntry(new ZipEntry("manifest.csv"));
                BufferedWriter writer = new BufferedWriter(new OutputStreamWriter(zip, StandardCharsets.UTF_8));
                writer.write('\uFEFF');
                writer.write("evidenceId,examName,studentName,severity,anomalyLabel,reviewStatus\n");
                for (Map<String, Object> item : evidences) {
                    writer.write(csv(item.get("evidenceId")) + "," + csv(item.get("examName")) + "," + csv(item.get("studentName")) + "," + csv(item.get("severity")) + "," + csv(item.get("anomalyLabel")) + "," + csv(item.get("reviewStatus")) + "\n");
                }
                writer.flush();
                zip.closeEntry();
                for (Map<String, Object> item : evidences) {
                    String evidenceId = String.valueOf(item.get("evidenceId"));
                    Resource media = anomalyEvidenceService.loadMedia(evidenceId);
                    if (media == null) {
                        continue;
                    }
                    String ext = String.valueOf(item.getOrDefault("mediaExt", "mp4"));
                    zip.putNextEntry(new ZipEntry("media/" + evidenceId + "." + ext));
                    try (var inputStream = media.getInputStream()) {
                        inputStream.transferTo(zip);
                    }
                    zip.closeEntry();
                }
            }
        };
        auditLogService.logCurrent("EVIDENCE_EXPORT", "EVIDENCE_ZIP", String.valueOf(evidences.size()), "批量下载作弊证据", "数量：" + evidences.size());
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"evidences.zip\"")
                .contentType(MediaType.parseMediaType("application/zip"))
                .body(body);
    }

    /**
     * 封装当前类中的一段独立业务步骤，减少调用方直接处理过多细节。
     * 阅读这个方法时，可以重点关注它读取了哪些输入、修改了哪些状态，以及异常或边界条件如何处理。
     */
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

    /**
     * 封装当前类中的一段独立业务步骤，减少调用方直接处理过多细节。
     * 阅读这个方法时，可以重点关注它读取了哪些输入、修改了哪些状态，以及异常或边界条件如何处理。
     */
    private List<Map<String, Object>> resolveAccessibleEvidences(UserDetailsImpl user, EvidenceExportReq req) {
        Set<String> ids = new TreeSet<>();
        if (req != null && req.evidenceIds() != null) {
            ids.addAll(req.evidenceIds().stream().filter(id -> id != null && !id.isBlank()).toList());
        }
        return ids.stream()
                .map(anomalyEvidenceService::getEvidence)
                .filter(item -> item != null && canView(user, item))
                .toList();
    }

    /**
     * 把输入值转换成当前模块更容易继续处理的标准格式。
     * 阅读这个方法时，可以重点关注它读取了哪些输入、修改了哪些状态，以及异常或边界条件如何处理。
     */
    private String normalizeReviewStatus(String reviewStatus) {
        String normalized = normalizeText(reviewStatus);
        if (normalized == null) {
            return "PENDING";
        }
        return switch (normalized.toUpperCase()) {
            case "PENDING", "REVIEWED", "FALSE_POSITIVE", "CONFIRMED_CHEATING" -> normalized.toUpperCase();
            default -> "PENDING";
        };
    }

    /**
     * 把输入值转换成当前模块更容易继续处理的标准格式。
     * 阅读这个方法时，可以重点关注它读取了哪些输入、修改了哪些状态，以及异常或边界条件如何处理。
     */
    private String normalizeText(String value) {
        if (value == null) {
            return null;
        }
        String text = value.trim();
        return text.isEmpty() ? null : text;
    }

    /**
     * 创建并组装当前业务对象或执行一段创建型流程。
     * 阅读这个方法时，可以重点关注它读取了哪些输入、修改了哪些状态，以及异常或边界条件如何处理。
     */
    private String buildEvidenceSummary(Map<String, Object> evidence) {
        return String.format("考试：%s ｜ 学生：%s ｜ 异常：%s",
                evidence.getOrDefault("examName", "-"),
                evidence.getOrDefault("studentName", "-"),
                evidence.getOrDefault("anomalyLabel", "-"));
    }

    private String buildEvidenceReport(Map<String, Object> evidence) {
        Map<String, Object> lines = new LinkedHashMap<>();
        lines.put("证据ID", evidence.get("evidenceId"));
        lines.put("考试名称", evidence.get("examName"));
        lines.put("学生姓名", evidence.get("studentName"));
        lines.put("考场", evidence.get("roomId"));
        lines.put("监考老师", evidence.get("invigilatorName"));
        lines.put("异常类型", evidence.get("anomalyLabel"));
        lines.put("严重级别", evidence.get("severity"));
        lines.put("异常时间", evidence.get("anomalyAt"));
        lines.put("处理状态", evidence.get("reviewStatus"));
        lines.put("处理人", evidence.get("reviewedByName"));
        lines.put("处理时间", evidence.get("reviewedAt"));
        lines.put("处理备注", evidence.get("reviewNote"));
        StringBuilder builder = new StringBuilder();
        lines.forEach((key, value) -> builder.append(key).append("：").append(value == null ? "-" : value).append('\n'));
        return builder.toString();
    }

    private String csv(Object value) {
        String text = value == null ? "" : String.valueOf(value).replace("\"", "\"\"");
        return "\"" + text + "\"";
    }
}
