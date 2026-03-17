package com.kovr.proctor.util;

import org.springframework.stereotype.Component;

import java.security.SecureRandom;
/**
 * PasswordGen 提供密码生成等辅助方法，用于初始化和账号创建流程。
 */

@Component
public class PasswordGen {
    private static final String ALPHA = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz";
    private static final String NUM = "0123456789";
    private static final String SYM = "!@#_-";
    private final SecureRandom r = new SecureRandom();

    /**
     * 创建并组装当前业务对象或执行一段创建型流程。
     * 阅读这个方法时，可以重点关注它读取了哪些输入、修改了哪些状态，以及异常或边界条件如何处理。
     */
    public String gen6() {
        String pool = ALPHA + NUM + SYM;
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < 6; i++) sb.append(pool.charAt(r.nextInt(pool.length())));
        return sb.toString();
    }
}
