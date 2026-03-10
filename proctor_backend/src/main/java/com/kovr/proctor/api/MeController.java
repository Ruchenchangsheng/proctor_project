package com.kovr.proctor.api;

import com.kovr.proctor.domain.entity.SchoolAdminEntity;
import com.kovr.proctor.domain.entity.StudentEntity;
import com.kovr.proctor.domain.entity.TeacherEntity;
import com.kovr.proctor.infra.mapper.SchoolAdminMapper;
import com.kovr.proctor.infra.mapper.StudentMapper;
import com.kovr.proctor.infra.mapper.TeacherMapper;
import com.kovr.proctor.security.UserDetailsImpl;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.Map;

@RestController
@RequiredArgsConstructor
public class MeController {
    private final StudentMapper sp;
    private final TeacherMapper tp;
    private final SchoolAdminMapper sap;

    @GetMapping("/api/me")
    public Map<String, Object> me(@AuthenticationPrincipal UserDetailsImpl u) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("userId", u.getId());
        m.put("email", u.getEmail());
        m.put("name", u.getName());
        m.put("role", u.getRole());
        switch (u.getRole()) {
            case "STUDENT" -> {
                StudentEntity p = sp.selectById(u.getId());
                if (p != null) {
                    m.put("schoolId", p.getSchoolId());
                    m.put("departmentId", p.getDepartmentId());
                    m.put("majorId", p.getMajorId());
                }
            }
            case "TEACHER" -> {
                TeacherEntity p = tp.selectById(u.getId());
                if (p != null) {
                    m.put("schoolId", p.getSchoolId());
                    m.put("departmentId", p.getDepartmentId());
                }
            }
            case "SCHOOL_ADMIN" -> {
                SchoolAdminEntity p = sap.selectById(u.getId());
                if (p != null) {
                    m.put("schoolId", p.getSchoolId());
                }
            }
        }
        return m;
    }
}
