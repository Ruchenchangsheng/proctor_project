package com.kovr.proctor.api;

import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.kovr.proctor.api.dto.ChangePasswordReq;
import com.kovr.proctor.common.BusinessException;
import com.kovr.proctor.domain.entity.UserEntity;
import com.kovr.proctor.infra.mapper.UserMapper;
import com.kovr.proctor.security.UserDetailsImpl;
import com.kovr.proctor.service.PlatformSettingService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;
/**
 * AccountController 负责当前账号相关的操作，例如修改密码等安全动作。
 */

@RestController
@RequestMapping("/api/account")
@RequiredArgsConstructor
public class AccountController {
    private final UserMapper userMapper;
    private final PasswordEncoder passwordEncoder;
    private final PlatformSettingService platformSettingService;

    /**
     * 封装当前类中的一段独立业务步骤，减少调用方直接处理过多细节。
     * 阅读这个方法时，可以重点关注它读取了哪些输入、修改了哪些状态，以及异常或边界条件如何处理。
     */
    @PostMapping("/change-password")
    @PreAuthorize("isAuthenticated()")
    public Map<String, Object> changePassword(
            @AuthenticationPrincipal UserDetailsImpl currentUser,
            @RequestBody @Valid ChangePasswordReq req) {
        UserEntity user = userMapper.selectById(currentUser.getId());
        if (user == null || user.getEnabled() == null || user.getEnabled() == 0) {
            throw new BusinessException("NOT_FOUND", "账号不存在或已禁用");
        }

        String oldPassword = normalizePassword(req.oldPassword());
        String newPassword = normalizePassword(req.newPassword());
        if (oldPassword == null || newPassword == null) {
            throw new BusinessException("BAD_REQUEST", "密码不能为空");
        }
        if (!passwordEncoder.matches(oldPassword, user.getPassword())) {
            throw new BusinessException("BAD_REQUEST", "当前密码不正确");
        }
        if (oldPassword.equals(newPassword)) {
            throw new BusinessException("BAD_REQUEST", "新密码不能与当前密码相同");
        }
        validatePassword(newPassword);

        userMapper.update(null, new LambdaUpdateWrapper<UserEntity>()
                .eq(UserEntity::getId, user.getId())
                .set(UserEntity::getPassword, passwordEncoder.encode(newPassword))
                .set(UserEntity::getMustChangePassword, 0)
                .set(UserEntity::getFailedLoginAttempts, 0)
                .set(UserEntity::getLockedUntil, null));
        return Map.of("ok", true);
    }

    private void validatePassword(String password) {
        int minLength = platformSettingService.getInt("security", "passwordMinLength", 8);
        boolean requireLetter = platformSettingService.getBoolean("security", "passwordRequireLetter", true);
        boolean requireNumber = platformSettingService.getBoolean("security", "passwordRequireNumber", true);
        int effectiveMinLength = Math.max(6, minLength);
        if (password.length() < effectiveMinLength) {
            throw new BusinessException("BAD_REQUEST", "新密码长度不能少于" + effectiveMinLength + "位");
        }
        if (requireLetter && !password.matches(".*[A-Za-z].*")) {
            throw new BusinessException("BAD_REQUEST", "新密码至少需要包含一个字母");
        }
        if (requireNumber && !password.matches(".*\\d.*")) {
            throw new BusinessException("BAD_REQUEST", "新密码至少需要包含一个数字");
        }
    }

    private String normalizePassword(String value) {
        if (value == null) {
            return null;
        }
        String text = value.replaceAll("\\s+", "");
        return text.isEmpty() ? null : text;
    }
}
