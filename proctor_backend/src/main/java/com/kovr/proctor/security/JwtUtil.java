package com.kovr.proctor.security;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jws;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.io.Decoders;
import io.jsonwebtoken.security.Keys;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import javax.crypto.SecretKey;
import java.time.Instant;
import java.util.Date;
/**
 * JwtUtil 负责 JWT 的签发、解析和基础字段读取，是后端鉴权的核心工具。
 */

@Component
public class JwtUtil {
    private final SecretKey key;
    private final long ttl;

    public JwtUtil(@Value("${security.jwt.secret}") String b64, @Value("${security.jwt.expMinutes:4320}") long expMinutes) {
        this.key = Keys.hmacShaKeyFor(Decoders.BASE64.decode(b64));
        this.ttl = java.time.Duration.ofMinutes(expMinutes).toMillis(); // ttl 用毫秒更好算
    }

    /**
     * 执行前置校验或条件判断，为后续主流程提供可靠分支依据。
     * 阅读这个方法时，可以重点关注它读取了哪些输入、修改了哪些状态，以及异常或边界条件如何处理。
     */
    public String issue(Long uid, String role) {
        Instant now = Instant.now();
        return Jwts.builder().subject(String.valueOf(uid)).claim("role", role).issuedAt(Date.from(now)).expiration(Date.from(now.plusMillis(ttl))).signWith(key).compact();
    }

    /**
     * 封装当前类中的一段独立业务步骤，减少调用方直接处理过多细节。
     * 阅读这个方法时，可以重点关注它读取了哪些输入、修改了哪些状态，以及异常或边界条件如何处理。
     */
    public Jws<Claims> parse(String token) {
        return Jwts.parser().verifyWith(key).build().parseSignedClaims(token);
    }
}