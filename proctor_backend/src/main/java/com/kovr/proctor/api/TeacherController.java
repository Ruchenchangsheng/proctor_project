package com.kovr.proctor.api;

import com.kovr.proctor.infra.mapper.DepartmentMapper;
import com.kovr.proctor.infra.mapper.ExamRoomMapper;
import com.kovr.proctor.infra.mapper.SchoolMapper;
import com.kovr.proctor.infra.mapper.TeacherMapper;
import com.kovr.proctor.infra.mapper.UserMapper;
import com.kovr.proctor.security.UserDetailsImpl;
import com.kovr.proctor.service.AnomalyEventService;
import com.kovr.proctor.service.ExamLiveStateService;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.ArrayList;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

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

    @GetMapping("/invigilations")
    @PreAuthorize("hasRole('TEACHER')")
    public List<Map<String, Object>> invigilations(
            @AuthenticationPrincipal UserDetailsImpl u,
            @RequestParam(required = false) String phase) {
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


    @GetMapping("/rooms/{examRoomId}/alerts")
    @PreAuthorize("hasRole('TEACHER')")
    public Map<String, Object> roomAlerts(
            @AuthenticationPrincipal UserDetailsImpl u,
            @PathVariable Long examRoomId) {
        Map<String, Object> room = examRoomMapper.selectOwnedRoomByTeacher(examRoomId, u.getId());
        if (room == null) {
            return Map.of("ok", false, "msg", "未找到该监考房间或无权限");
        }
        Map<String, Object> res = new LinkedHashMap<>();
        res.put("ok", true);
        res.put("active", anomalyEventService.listActiveStates(examRoomId));
        res.put("events", anomalyEventService.listRoomEvents(examRoomId));
        return res;
    }

    @GetMapping("/rooms/{examRoomId}/live")
    @PreAuthorize("hasRole('TEACHER')")
    public Map<String, Object> roomLive(
            @AuthenticationPrincipal UserDetailsImpl u,
            @PathVariable Long examRoomId) {
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
