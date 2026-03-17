package com.kovr.proctor.api;

import com.kovr.proctor.infra.mapper.DepartmentMapper;
import com.kovr.proctor.infra.mapper.ExamRoomMapper;
import com.kovr.proctor.infra.mapper.SchoolMapper;
import com.kovr.proctor.infra.mapper.TeacherMapper;
import com.kovr.proctor.infra.mapper.UserMapper;
import com.kovr.proctor.security.UserDetailsImpl;
import com.kovr.proctor.service.AnomalyEventService;
import com.kovr.proctor.service.AnomalyEvidenceService;
import com.kovr.proctor.service.ExamLiveStateService;
import com.kovr.proctor.service.AnomalyPolicyService;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
/**
 * TeacherController 提供教师监考任务、实时告警和证据查询等接口。
 */

@RestController
@RequestMapping("/api/teacher")
@RequiredArgsConstructor
public class TeacherController {
    private final UserMapper um;
    private final TeacherMapper tp;
    private final SchoolMapper sm;
    private final DepartmentMapper dm;
    private final ExamRoomMapper examRoomMapper;
    private final ExamLiveStateService examLiveStateService;
    private final AnomalyEventService anomalyEventService;
    private final AnomalyPolicyService anomalyPolicyService;
    private final AnomalyEvidenceService anomalyEvidenceService;

    /**
     * 封装当前类中的一段独立业务步骤，减少调用方直接处理过多细节。
     * 阅读这个方法时，可以重点关注它读取了哪些输入、修改了哪些状态，以及异常或边界条件如何处理。
     */
    @GetMapping("/profile")
    @PreAuthorize("hasRole('TEACHER')")
    public Map<String, Object> profile(@AuthenticationPrincipal UserDetailsImpl u) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("name", u.getName());
        var p = tp.selectById(u.getId());
        if (p != null) {
            var s = sm.selectById(p.getSchoolId());
            var d = dm.selectById(p.getDepartmentId());
            m.put("schoolName", s == null ? null : s.getName());
            m.put("departmentName", d == null ? null : d.getName());
        }
        return m;
    }

    /**
     * 封装当前类中的一段独立业务步骤，减少调用方直接处理过多细节。
     * 阅读这个方法时，可以重点关注它读取了哪些输入、修改了哪些状态，以及异常或边界条件如何处理。
     */
    @GetMapping("/invigilations")
    @PreAuthorize("hasRole('TEACHER')")
    public List<Map<String, Object>> invigilations(
            @AuthenticationPrincipal UserDetailsImpl u,
            @RequestParam(required = false) String phase) {
        // 教师任务列表除了房间基本信息，还会预取学生清单，方便前端直接渲染任务卡片。
        List<Map<String, Object>> rows = examRoomMapper.selectInvigilationsByTeacher(u.getId(), phase);
        List<Map<String, Object>> result = new ArrayList<>();
        for (Map<String, Object> row : rows) {
            Map<String, Object> item = new LinkedHashMap<>(row);
            Object roomId = row.get("examRoomId");
            if (roomId instanceof Number id) {
                item.put("students", examRoomMapper.selectStudentsByRoomId(id.longValue()));
            } else {
                item.put("students", List.of());
            }
            result.add(item);
        }
        return result;
    }


    /**
     * 封装当前类中的一段独立业务步骤，减少调用方直接处理过多细节。
     * 阅读这个方法时，可以重点关注它读取了哪些输入、修改了哪些状态，以及异常或边界条件如何处理。
     */
    @GetMapping("/rooms/{examRoomId}/students")
    @PreAuthorize("hasRole('TEACHER')")
    public Map<String, Object> roomStudents(
            @AuthenticationPrincipal UserDetailsImpl u,
            @PathVariable Long examRoomId) {
        Map<String, Object> room = examRoomMapper.selectOwnedRoomByTeacher(examRoomId, u.getId());
        if (room == null) {
            return Map.of("ok", false, "msg", "未找到该监考房间或无权限");
        }
        return Map.of("ok", true, "students", examRoomMapper.selectStudentsByRoomId(examRoomId));
    }


    /**
     * 封装当前类中的一段独立业务步骤，减少调用方直接处理过多细节。
     * 阅读这个方法时，可以重点关注它读取了哪些输入、修改了哪些状态，以及异常或边界条件如何处理。
     */
    @GetMapping("/rooms/{examRoomId}/alerts")
    @PreAuthorize("hasRole('TEACHER')")
    public Map<String, Object> roomAlerts(
            @AuthenticationPrincipal UserDetailsImpl u,
            @PathVariable Long examRoomId) {
        // 告警接口把“当前仍在持续的异常”和“已结束但需回放的异常证据”一起返回给监考页。
        Map<String, Object> room = examRoomMapper.selectOwnedRoomByTeacher(examRoomId, u.getId());
        if (room == null) {
            return Map.of("ok", false, "msg", "未找到该监考房间或无权限");
        }
        Map<String, Object> res = new LinkedHashMap<>();
        res.put("ok", true);
        res.put("active", anomalyEventService.listActiveStates(examRoomId));
        res.put("events", anomalyEventService.listRoomEvents(examRoomId));
        res.put("evidences", anomalyEvidenceService.listByRoom(examRoomId));
        Long schoolId = room.get("schoolId") instanceof Number n ? n.longValue() : null;
        res.put("policy", anomalyPolicyService.asMap(anomalyPolicyService.getPolicy(schoolId)));
        res.put("examEnded", isExamEnded(room.get("endAt")));
        return res;
    }

    private boolean isExamEnded(Object endAtValue) {
        if (endAtValue == null) return false;
        try {
            LocalDateTime endAt = LocalDateTime.parse(String.valueOf(endAtValue), DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));
            return LocalDateTime.now().isAfter(endAt);
        } catch (Exception ignore) {
            return false;
        }
    }

    @GetMapping("/rooms/{examRoomId}/live")
    @PreAuthorize("hasRole('TEACHER')")
    public Map<String, Object> roomLive(
            @AuthenticationPrincipal UserDetailsImpl u,
            @PathVariable Long examRoomId) {
        // live 接口只返回已经有最新帧的学生，未入场学生不占用教师端监考宫格。
        Map<String, Object> room = examRoomMapper.selectOwnedRoomByTeacher(examRoomId, u.getId());
        if (room == null) {
            return Map.of("ok", false, "msg", "未找到该监考房间或无权限");
        }
        List<Map<String, Object>> students = examRoomMapper.selectStudentsByRoomId(examRoomId);
        List<Map<String, Object>> items = new ArrayList<>();
        for (Map<String, Object> student : students) {
            Map<String, Object> item = new LinkedHashMap<>(student);
            Long studentId = ((Number) student.get("studentId")).longValue();
            var frame = examLiveStateService.getFrame(examRoomId, studentId);
            if (frame != null) {
                String b64 = Base64.getEncoder().encodeToString(frame.imageBytes());
                item.put("frameDataUrl", "data:" + frame.mime() + ";base64," + b64);
                item.put("updatedAt", frame.updatedAt().toString());
                item.put("status", null);
                items.add(item);
            } else {
                // 未进入考试（尚未上传画面）的学生不渲染窗口
            }
        }

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("ok", true);
        result.put("room", room);
        result.put("students", items);
        return result;
    }
}
