package com.kovr.proctor.api;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.kovr.proctor.common.BusinessException;
import com.kovr.proctor.domain.entity.SchoolAdminEntity;
import com.kovr.proctor.domain.entity.StudentEntity;
import com.kovr.proctor.domain.entity.TeacherEntity;
import com.kovr.proctor.domain.entity.UserEntity;
import com.kovr.proctor.infra.mapper.SchoolAdminMapper;
import com.kovr.proctor.infra.mapper.StudentMapper;
import com.kovr.proctor.infra.mapper.TeacherMapper;
import com.kovr.proctor.infra.mapper.UserMapper;
import com.kovr.proctor.security.UserDetailsImpl;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.Map;

@RestController
@RequiredArgsConstructor
public class MeController {
    private final StudentMapper sp;
    private final TeacherMapper tp;
    private final SchoolAdminMapper sap;
    private final UserMapper userMapper;
    private final PasswordEncoder pe;

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

    @PostMapping("/api/me/password")
    public Map<String, Object> changePassword(
            @AuthenticationPrincipal UserDetailsImpl u,
            @RequestBody ChangePasswordReq req) {
        if (req == null || req.oldPassword() == null || req.oldPassword().isBlank()
                || req.newPassword() == null || req.newPassword().isBlank()) {
            throw new BusinessException("BAD_REQUEST", "原密码和新密码不能为空");
        }
        if (req.newPassword().length() < 6) {
            throw new BusinessException("BAD_REQUEST", "新密码长度不能小于 6 位");
        }
        UserEntity dbUser = userMapper.selectOne(new LambdaQueryWrapper<UserEntity>()
                .eq(UserEntity::getId, u.getId()));
        if (dbUser == null || dbUser.getEnabled() == null || dbUser.getEnabled() == 0) {
            throw new BusinessException("NOT_FOUND", "用户不存在或已禁用");
        }
        if (!pe.matches(req.oldPassword(), dbUser.getPassword())) {
            throw new BusinessException("BAD_CREDENTIALS", "原密码不正确");
        }
        dbUser.setPassword(pe.encode(req.newPassword()));
        userMapper.updateById(dbUser);
        return Map.of("success", true, "message", "密码修改成功，请使用新密码重新登录");
    }

    public record ChangePasswordReq(String oldPassword, String newPassword) {
    }
}
