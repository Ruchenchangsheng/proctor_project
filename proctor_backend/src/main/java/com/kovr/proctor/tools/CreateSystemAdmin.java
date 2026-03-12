package com.kovr.proctor.tools;

import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;

import java.io.InputStream;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.time.LocalDateTime;
import java.util.Properties;

/**
 * 独立运行：创建或重置系统管理员账号（role=ADMIN）。
 *
 * 运行方式（在 proctor_backend 目录）：
 * 1) 先编译：mvn -DskipTests compile
 * 2) 执行：
 *    java -cp "target/classes:target/dependency/*" com.kovr.proctor.tools.CreateSystemAdmin admin@example.com "系统管理员" "Admin@123456"
 *
 * 可选参数：
 *   args[0] 邮箱（默认：admin@proctor.local）
 *   args[1] 姓名（默认：系统管理员）
 *   args[2] 明文密码（默认：Admin@123456）
 */
public class CreateSystemAdmin {

    public static void main(String[] args) throws Exception {
        String email = argOrDefault(args, 0, "admin@sys.com").trim();
        String name = argOrDefault(args, 1, "系统管理员").trim();
        String rawPassword = argOrDefault(args, 2, "1234").trim();

        if (email.isEmpty() || rawPassword.isEmpty()) {
            throw new IllegalArgumentException("邮箱和密码不能为空");
        }

        Properties props = loadAppProperties();
        String url = require(props, "spring.datasource.url");
        String username = require(props, "spring.datasource.username");
        String password = require(props, "spring.datasource.password");

        String encoded = new BCryptPasswordEncoder().encode(rawPassword);

        try (Connection conn = DriverManager.getConnection(url, username, password)) {
            conn.setAutoCommit(false);
            try {
                Long existingId = findUserIdByEmail(conn, email);
                if (existingId == null) {
                    insertAdmin(conn, email, encoded, name);
                    System.out.printf("[OK] 已创建系统管理员账号: %s%n", email);
                } else {
                    updateAdmin(conn, existingId, encoded, name);
                    System.out.printf("[OK] 已重置系统管理员账号: %s (id=%d)%n", email, existingId);
                }
                conn.commit();
            } catch (Exception ex) {
                conn.rollback();
                throw ex;
            }
        }

        System.out.println("默认登录信息（如未传参）：admin@sys.com / 1234");
        System.out.println("提示：请首次登录后立即修改密码。\n");
    }

    private static String argOrDefault(String[] args, int idx, String def) {
        if (args == null || args.length <= idx || args[idx] == null) return def;
        String value = args[idx].trim();
        return value.isEmpty() ? def : value;
    }

    private static Properties loadAppProperties() throws Exception {
        Properties p = new Properties();
        try (InputStream in = CreateSystemAdmin.class.getClassLoader().getResourceAsStream("application.properties")) {
            if (in == null) {
                throw new IllegalStateException("找不到 application.properties，请在 proctor_backend 目录内先编译再运行");
            }
            p.load(in);
        }
        return p;
    }

    private static String require(Properties p, String key) {
        String value = p.getProperty(key);
        if (value == null || value.trim().isEmpty()) {
            throw new IllegalStateException("缺少配置: " + key);
        }
        return value.trim();
    }

    private static Long findUserIdByEmail(Connection conn, String email) throws Exception {
        String sql = "select id from users where email = ? limit 1";
        try (PreparedStatement ps = conn.prepareStatement(sql)) {
            ps.setString(1, email);
            try (ResultSet rs = ps.executeQuery()) {
                return rs.next() ? rs.getLong("id") : null;
            }
        }
    }

    private static void insertAdmin(Connection conn, String email, String encodedPassword, String name) throws Exception {
        String sql = "insert into users(email, password, name, role, enabled, created_at, updated_at) values (?, ?, ?, 'ADMIN', 1, ?, ?)";
        LocalDateTime now = LocalDateTime.now();
        try (PreparedStatement ps = conn.prepareStatement(sql)) {
            ps.setString(1, email);
            ps.setString(2, encodedPassword);
            ps.setString(3, name);
            ps.setObject(4, now);
            ps.setObject(5, now);
            ps.executeUpdate();
        }
    }

    private static void updateAdmin(Connection conn, Long userId, String encodedPassword, String name) throws Exception {
        String sql = "update users set password = ?, name = ?, role = 'ADMIN', enabled = 1, updated_at = ? where id = ?";
        try (PreparedStatement ps = conn.prepareStatement(sql)) {
            ps.setString(1, encodedPassword);
            ps.setString(2, name);
            ps.setObject(3, LocalDateTime.now());
            ps.setLong(4, userId);
            ps.executeUpdate();
        }
    }
}
