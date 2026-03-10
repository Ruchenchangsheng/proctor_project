package com.kovr.proctor.security;

import jakarta.servlet.*; import jakarta.servlet.http.*; import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder; import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.stereotype.Component; import org.springframework.web.filter.OncePerRequestFilter;
import lombok.RequiredArgsConstructor; import io.jsonwebtoken.*;

import java.io.IOException;

@Component @RequiredArgsConstructor
public class JwtAuthFilter extends OncePerRequestFilter {
    private final JwtUtil jwt; private final UserDetailsService uds;
    @Override
    protected void doFilterInternal(HttpServletRequest req, HttpServletResponse res, FilterChain chain)
            throws ServletException, IOException {
        String h = req.getHeader("Authorization");
        if (h != null && h.startsWith("Bearer ")) {
            try {
                var claims = jwt.parse(h.substring(7)).getPayload();
                var user = uds.loadUserByUsername(claims.getSubject()); // 这里 subject 可能是数字ID
                var auth = new UsernamePasswordAuthenticationToken(user, null, user.getAuthorities());
                SecurityContextHolder.getContext().setAuthentication(auth);
            } catch (io.jsonwebtoken.JwtException | UsernameNotFoundException e) {
                // ❗ 忽略：保持未认证状态，让后续入口返回 401，而不是抛异常导致 403/500
                SecurityContextHolder.clearContext();
            }
        }
        chain.doFilter(req, res);
    }
}