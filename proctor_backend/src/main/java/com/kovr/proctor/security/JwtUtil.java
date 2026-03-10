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

@Component
public class JwtUtil {
    private final SecretKey key;
    private final long ttl;

    public JwtUtil(@Value("${security.jwt.secret}") String b64, @Value("${security.jwt.expMinutes:4320}") long expMinutes) {
        this.key = Keys.hmacShaKeyFor(Decoders.BASE64.decode(b64));
        this.ttl = java.time.Duration.ofMinutes(expMinutes).toMillis(); // ttl 用毫秒更好算
    }

    public String issue(Long uid, String role) {
        Instant now = Instant.now();
        return Jwts.builder().subject(String.valueOf(uid)).claim("role", role).issuedAt(Date.from(now)).expiration(Date.from(now.plusMillis(ttl))).signWith(key).compact();
    }

    public Jws<Claims> parse(String token) {
        return Jwts.parser().verifyWith(key).build().parseSignedClaims(token);
    }
}