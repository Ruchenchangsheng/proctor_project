package com.kovr.proctor.api;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.kovr.proctor.api.dto.LoginReq;
import com.kovr.proctor.common.BusinessException;
import com.kovr.proctor.domain.entity.UserEntity;
import com.kovr.proctor.infra.mapper.UserMapper;
import com.kovr.proctor.security.JwtUtil;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequiredArgsConstructor
public class AuthController {
    private final UserMapper userMapper;
    private final PasswordEncoder pe;
    private final JwtUtil jwt;

    @PostMapping("/api/auth/login")
    public Map<String, String> login(@RequestBody @Valid LoginReq req) {
        UserEntity u = userMapper.selectOne(new LambdaQueryWrapper<UserEntity>().eq(UserEntity::getEmail, req.email()));
        if (u == null || u.getEnabled() == null || u.getEnabled() == 0 || !pe.matches(req.password(), u.getPassword()))
            throw new BusinessException("BAD_CREDENTIALS", "邮箱或密码不正确");
        return Map.of("token", jwt.issue(u.getId(), u.getRole()));
    }
}
