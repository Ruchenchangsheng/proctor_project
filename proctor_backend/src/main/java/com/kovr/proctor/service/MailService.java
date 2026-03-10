package com.kovr.proctor.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.JavaMailSenderImpl;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.stereotype.Service;

import jakarta.mail.internet.InternetAddress;

@Service
@RequiredArgsConstructor
@Slf4j
public class MailService {
    private final JavaMailSender sender;

    @Value("${spring.mail.from:}")        // 可留空，代码里自动回退到 username
    String from;

    @Value("${app.mail.enabled:true}")    // 可通过配置关闭发信（开发测试用）
    boolean mailEnabled;

    /** 返回 true=发送成功；false=失败（仅记录日志，不抛异常） */
    public boolean sendAccount(String to, String name, String email, String rawPwd) {
        if (!mailEnabled) {
            log.info("Mail disabled by config, skip sending to {}", to);
            return true; // 不阻塞主流程
        }
        try {
            // 用认证账号作为真正的 From，避免 501
            String username = (sender instanceof JavaMailSenderImpl impl) ? impl.getUsername() : null;
            String fromAddr = (from != null && !from.isBlank()) ? from.trim() : username;

            var msg = sender.createMimeMessage();
            var helper = new MimeMessageHelper(msg, false, "UTF-8");
            // 带显示名的 From（可选）
            helper.setFrom(new InternetAddress(fromAddr, "监考系统", "UTF-8"));
            helper.setTo(to);
            helper.setSubject("监考系统账号开通");
            helper.setText("你好 " + name + "：\n账号：" + email + "\n初始密码：" + rawPwd + "\n请尽快登录并修改密码。", false);

            sender.send(msg);

            String ok = "[MAIL] sent OK, to=" + to + ", subject=" + helper.getMimeMessage().getSubject();
            System.out.println("----------------------");
            System.out.println("------邮箱发送成功   MailService------");
            System.out.println("----------------------");
            System.out.println(ok);
            log.info(ok);

            return true;
        } catch (Exception e) {
            System.out.println("----------------------");
            System.out.println("------邮箱发送失败   MailService------");
            System.out.println("----------------------");
            log.warn("Send mail failed. to={}, reason={}", to, e.toString());

            return false;
        }
    }
}
