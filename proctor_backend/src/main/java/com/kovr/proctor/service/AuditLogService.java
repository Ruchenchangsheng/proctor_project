package com.kovr.proctor.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.kovr.proctor.domain.entity.AuditLogEntity;
import com.kovr.proctor.infra.mapper.AuditLogMapper;
import com.kovr.proctor.security.UserDetailsImpl;
import lombok.RequiredArgsConstructor;
import org.springframework.security.authentication.AnonymousAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
@RequiredArgsConstructor
public class AuditLogService {
    private final AuditLogMapper auditLogMapper;

    public void logCurrent(String actionType, String targetType, String targetId, String summary, String detail) {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null || !authentication.isAuthenticated() || authentication instanceof AnonymousAuthenticationToken) {
            insert(null, null, "SYSTEM", actionType, targetType, targetId, summary, detail);
            return;
        }
        Object principal = authentication.getPrincipal();
        if (principal instanceof UserDetailsImpl user) {
            insert(user.getId(), user.getRole(), user.getName(), actionType, targetType, targetId, summary, detail);
            return;
        }
        insert(null, null, String.valueOf(principal), actionType, targetType, targetId, summary, detail);
    }

    public void logExplicit(Long actorUserId, String actorRole, String actorName, String actionType, String targetType, String targetId, String summary, String detail) {
        insert(actorUserId, actorRole, actorName, actionType, targetType, targetId, summary, detail);
    }

    public List<Map<String, Object>> listRecent(int limit) {
        return auditLogMapper.selectList(new LambdaQueryWrapper<AuditLogEntity>()
                        .orderByDesc(AuditLogEntity::getCreatedAt)
                        .last("limit " + Math.max(1, limit)))
                .stream()
                .map(this::toMap)
                .toList();
    }

    private void insert(Long actorUserId, String actorRole, String actorName, String actionType, String targetType, String targetId, String summary, String detail) {
        AuditLogEntity entity = new AuditLogEntity();
        entity.setActorUserId(actorUserId);
        entity.setActorRole(actorRole);
        entity.setActorName(actorName);
        entity.setActionType(actionType);
        entity.setTargetType(targetType);
        entity.setTargetId(targetId);
        entity.setSummary(summary);
        entity.setDetail(detail);
        entity.setCreatedAt(LocalDateTime.now());
        auditLogMapper.insert(entity);
    }

    private Map<String, Object> toMap(AuditLogEntity entity) {
        Map<String, Object> item = new LinkedHashMap<>();
        item.put("id", entity.getId());
        item.put("time", entity.getCreatedAt());
        item.put("type", entity.getActionType());
        item.put("title", entity.getSummary());
        item.put("detail", entity.getDetail());
        item.put("actorName", entity.getActorName());
        item.put("actorRole", entity.getActorRole());
        item.put("targetType", entity.getTargetType());
        item.put("targetId", entity.getTargetId());
        return item;
    }
}
