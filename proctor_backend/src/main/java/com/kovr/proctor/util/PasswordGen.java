package com.kovr.proctor.util;

import org.springframework.stereotype.Component;

import java.security.SecureRandom;

@Component
public class PasswordGen {
    private static final String ALPHA = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz";
    private static final String NUM = "23456789";
    private static final String SYM = "!@#_-";
    private final SecureRandom r = new SecureRandom();

    public String gen6() {
        String pool = ALPHA + NUM + SYM;
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < 6; i++) sb.append(pool.charAt(r.nextInt(pool.length())));
        return sb.toString();
    }
}
