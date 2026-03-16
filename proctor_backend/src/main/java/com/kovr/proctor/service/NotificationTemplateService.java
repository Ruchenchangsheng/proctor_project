package com.kovr.proctor.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.kovr.proctor.domain.entity.NotificationTemplateEntity;
import com.kovr.proctor.infra.mapper.NotificationTemplateMapper;
import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.DependsOn;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

@Service
@DependsOn("databaseSchemaInitializer")
@RequiredArgsConstructor
public class NotificationTemplateService {
    private final NotificationTemplateMapper notificationTemplateMapper;

    @PostConstruct
    public void seedDefaults() {
        seed("ACCOUNT_OPENING", "EMAIL", "监考系统账号开通", """
                你好 ${name}：
                账号：${email}
                初始密码：${password}
                请尽快登录并修改密码。
                """.strip());
        seed("PASSWORD_RESET", "EMAIL", "监考系统密码重置", """
                你好 ${name}：
                账号：${email}
                临时密码：${password}
                请尽快登录并修改密码。
                """.strip());
        seed("SYSTEM_NOTICE", "EMAIL", "监考系统公告通知", """
                你好 ${name}：
                ${content}
                """.strip());
    }

    public List<Map<String, Object>> listTemplates() {
        return notificationTemplateMapper.selectList(new LambdaQueryWrapper<NotificationTemplateEntity>()
                        .orderByAsc(NotificationTemplateEntity::getTemplateCode))
                .stream()
                .map(this::toMap)
                .toList();
    }

    public Map<String, Object> getTemplate(String code) {
        NotificationTemplateEntity entity = findByCode(code);
        return entity == null ? null : toMap(entity);
    }

    public void updateTemplate(String code, String channel, String subject, String content, boolean enabled, Long actorUserId) {
        NotificationTemplateEntity entity = findByCode(code);
        if (entity == null) {
            entity = new NotificationTemplateEntity();
            entity.setTemplateCode(code);
        }
        entity.setChannel(normalize(channel, "EMAIL"));
        entity.setSubject(subject == null ? "" : subject.trim());
        entity.setContent(content == null ? "" : content.trim());
        entity.setEnabled(enabled ? 1 : 0);
        entity.setUpdatedByUserId(actorUserId);
        entity.setUpdatedAt(LocalDateTime.now());
        if (entity.getId() == null) {
            notificationTemplateMapper.insert(entity);
        } else {
            notificationTemplateMapper.updateById(entity);
        }
    }

    public RenderedTemplate render(String code, Map<String, String> variables) {
        NotificationTemplateEntity entity = findByCode(code);
        if (entity == null) {
            return new RenderedTemplate("", "");
        }
        String subject = entity.getSubject();
        String content = entity.getContent();
        for (Map.Entry<String, String> entry : variables.entrySet()) {
            String token = "${" + entry.getKey() + "}";
            subject = subject.replace(token, entry.getValue() == null ? "" : entry.getValue());
            content = content.replace(token, entry.getValue() == null ? "" : entry.getValue());
        }
        return new RenderedTemplate(subject, content);
    }

    private void seed(String code, String channel, String subject, String content) {
        if (findByCode(code) != null) {
            return;
        }
        updateTemplate(code, channel, subject, content, true, null);
    }

    private NotificationTemplateEntity findByCode(String code) {
        return notificationTemplateMapper.selectOne(new LambdaQueryWrapper<NotificationTemplateEntity>()
                .eq(NotificationTemplateEntity::getTemplateCode, normalize(code, null))
                .last("limit 1"));
    }

    private Map<String, Object> toMap(NotificationTemplateEntity entity) {
        Map<String, Object> item = new LinkedHashMap<>();
        item.put("templateCode", entity.getTemplateCode());
        item.put("channel", entity.getChannel());
        item.put("subject", entity.getSubject());
        item.put("content", entity.getContent());
        item.put("enabled", entity.getEnabled());
        item.put("updatedAt", entity.getUpdatedAt());
        return item;
    }

    private String normalize(String value, String fallback) {
        if (value == null || value.isBlank()) {
            return fallback;
        }
        return value.trim().toUpperCase(Locale.ROOT);
    }

    public record RenderedTemplate(String subject, String content) {}
}
