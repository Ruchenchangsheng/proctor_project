package com.kovr.proctor.api;

import com.kovr.proctor.infra.mapper.DepartmentMapper;
import com.kovr.proctor.infra.mapper.SchoolMapper;
import com.kovr.proctor.infra.mapper.TeacherMapper;
import com.kovr.proctor.infra.mapper.UserMapper;
import com.kovr.proctor.security.UserDetailsImpl;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.Map;

@RestController
@RequestMapping("/api/teacher")
@RequiredArgsConstructor
public class TeacherController {
    private final UserMapper um;
    private final TeacherMapper tp;
    private final SchoolMapper sm;
    private final DepartmentMapper dm;

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
}
