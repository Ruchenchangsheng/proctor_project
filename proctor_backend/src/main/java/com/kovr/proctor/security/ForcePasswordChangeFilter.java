package com.kovr.proctor.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.http.MediaType;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
/**
 * ForcePasswordChangeFilter 在首次登录或密码重置后限制访问范围，强制用户先改密码。
 */

@Component
@RequiredArgsConstructor
public class ForcePasswordChangeFilter extends OncePerRequestFilter {
    /**
     * 封装当前类中的一段独立业务步骤，减少调用方直接处理过多细节。
     * 阅读这个方法时，可以重点关注它读取了哪些输入、修改了哪些状态，以及异常或边界条件如何处理。
     */
    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        String path = request.getRequestURI();
        // 允许登录、读取自身信息和改密接口先通过，否则用户会被锁死在无法完成改密的循环里。
        return path == null
                || path.startsWith("/api/auth/")
                || path.equals("/api/me")
                || path.equals("/api/account/change-password")
                || path.startsWith("/error");
    }

    /**
     * 封装当前类中的一段独立业务步骤，减少调用方直接处理过多细节。
     * 阅读这个方法时，可以重点关注它读取了哪些输入、修改了哪些状态，以及异常或边界条件如何处理。
     */
    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
            throws ServletException, IOException {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        Object principal = authentication == null ? null : authentication.getPrincipal();
        if (principal instanceof UserDetailsImpl user && user.isMustChangePassword()) {
            // 428 明确表达“前置条件未满足”：当前账号必须先完成改密才能继续访问业务接口。
            response.setStatus(428);
            response.setContentType(MediaType.APPLICATION_JSON_VALUE);
            response.getWriter().write("{\"error\":\"PasswordChangeRequired\",\"message\":\"请先修改密码后再继续操作\",\"code\":\"MUST_CHANGE_PASSWORD\"}");
            return;
        }
        filterChain.doFilter(request, response);
    }
}
