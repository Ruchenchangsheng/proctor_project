package com.kovr.proctor.api;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.kovr.proctor.api.dto.LoginReq;
import com.kovr.proctor.common.BusinessException;
import com.kovr.proctor.domain.entity.UserEntity;
import com.kovr.proctor.infra.mapper.UserMapper;
import com.kovr.proctor.security.JwtUtil;
import com.kovr.proctor.service.PlatformSettingService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDateTime;
import java.util.Map;

@RestController
@RequiredArgsConstructor
public class AuthController {
    private final UserMapper userMapper;
    private final PasswordEncoder pe;
    private final JwtUtil jwt;
    private final PlatformSettingService platformSettingService;

    @PostMapping("/api/auth/login")
    public Map<String, String> login(@RequestBody @Valid LoginReq req) {
        UserEntity u = userMapper.selectOne(new LambdaQueryWrapper<UserEntity>().eq(UserEntity::getEmail, req.email()));
        if (u == null || u.getEnabled() == null || u.getEnabled() == 0) {
            throw new BusinessException("BAD_CREDENTIALS", "邮箱或密码不正确");
        }
        if (u.getLockedUntil() != null && u.getLockedUntil().isAfter(LocalDateTime.now())) {
            throw new BusinessException("ACCOUNT_LOCKED", "登录失败次数过多，请稍后再试");
        }
        if (!pe.matches(req.password(), u.getPassword())) {
            int nextAttempts = (u.getFailedLoginAttempts() == null ? 0 : u.getFailedLoginAttempts()) + 1;
            int maxAttempts = platformSettingService.getInt("security", "maxLoginAttempts", 5);
            int lockMinutes = platformSettingService.getInt("security", "lockMinutes", 15);
            LambdaUpdateWrapper<UserEntity> update = new LambdaUpdateWrapper<UserEntity>()
                    .eq(UserEntity::getId, u.getId())
                    .set(UserEntity::getFailedLoginAttempts, nextAttempts);
            if (nextAttempts >= Math.max(1, maxAttempts)) {
                update.set(UserEntity::getLockedUntil, LocalDateTime.now().plusMinutes(Math.max(1, lockMinutes)))
                        .set(UserEntity::getFailedLoginAttempts, 0);
            }
            userMapper.update(null, update);
            throw new BusinessException("BAD_CREDENTIALS", nextAttempts >= Math.max(1, maxAttempts)
                    ? "登录失败次数过多，账号已临时锁定"
                    : "邮箱或密码不正确");
        }
        userMapper.update(null, new LambdaUpdateWrapper<UserEntity>()
                .eq(UserEntity::getId, u.getId())
                .set(UserEntity::getFailedLoginAttempts, 0)
                .set(UserEntity::getLockedUntil, null));
        return Map.of("token", jwt.issue(u.getId(), u.getRole()));
    }
}
