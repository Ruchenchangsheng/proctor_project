package com.kovr.proctor.security;

import java.security.SecureRandom;
import java.util.Base64;

public class BASE64_Create {
    public static void main(String[] args) {
        int bytes = 32; // 默认 256-bit
        for (int i = 0; i < args.length - 1; i++) {
            if ("--bits".equals(args[i])) {
                bytes = Math.max(32, Integer.parseInt(args[i + 1]) / 8);
            } else if ("--bytes".equals(args[i])) {
                bytes = Math.max(32, Integer.parseInt(args[i + 1]));
            }
        }

        // 尽量使用强随机源；不可用时退回默认 SecureRandom
        SecureRandom sr;
        try {
            sr = SecureRandom.getInstanceStrong();
        } catch (Exception ignore) {
            sr = new SecureRandom();
        }

        byte[] key = new byte[bytes];
        sr.nextBytes(key);

        // 标准 Base64（适配你当前 JwtUtil 里的 Decoders.BASE64）
        String base64 = Base64.getEncoder().encodeToString(key);

        System.out.println("=== JWT Secret (Standard Base64) ===");
        System.out.println(base64);
        System.out.println();
        System.out.println("# 建议设置为环境变量（任选其一）：");
        System.out.println("Linux/macOS:");
        System.out.println("  export JWT_SECRET_BASE64=" + base64);
        System.out.println("Windows PowerShell:");
        System.out.println("  setx JWT_SECRET_BASE64 \"" + base64 + "\"");
        System.out.println();
        System.out.println("# application.properties 示例（引用环境变量）：");
        System.out.println("security.jwt.secret=${JWT_SECRET_BASE64}");
    }
}
