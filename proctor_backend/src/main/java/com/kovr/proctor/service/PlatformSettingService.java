package com.kovr.proctor.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.kovr.proctor.domain.entity.PlatformSettingEntity;
import com.kovr.proctor.infra.mapper.PlatformSettingMapper;
import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.DependsOn;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
/**
 * PlatformSettingService 负责读取和更新平台级配置项，为安全策略和系统行为提供参数。
 */

@Service
@DependsOn("databaseSchemaInitializer")
@RequiredArgsConstructor
public class PlatformSettingService {
    private final PlatformSettingMapper platformSettingMapper;

    @Value("${server.port:8080}")
    private String serverPort;
    @Value("${app.cors.allowed-origins:}")
    private String corsOrigins;
    @Value("${face.base:http://localhost:8000}")
    private String faceBase;
    @Value("${anomaly.base:http://localhost:8000}")
    private String anomalyBase;
    @Value("${app.mail.enabled:true}")
    private boolean mailEnabled;
    @Value("${spring.mail.host:}")
    private String mailHost;
    @Value("${spring.mail.port:0}")
    private int mailPort;
    @Value("${spring.mail.username:}")
    private String mailUsername;
    @Value("${spring.mail.from:}")
    private String springMailFrom;
    @Value("${mail.from:}")
    private String legacyMailFrom;
    @Value("${app.face.verify.threshold:0.55}")
    private double faceVerifyThreshold;
    @Value("${app.face.min_det_score:0.55}")
    private double minFaceDetScore;
    @Value("${anomaly.min-duration-ms:2000}")
    private long anomalyMinDurationMs;
    @Value("${anomaly.max-reconnect-count:3}")
    private int maxReconnectCount;
    @Value("${anomaly.evidence.video-format:mp4}")
    private String evidenceVideoFormat;
    @Value("${anomaly.evidence.padding-before-ms:1000}")
    private long evidencePaddingBeforeMs;
    @Value("${anomaly.evidence.padding-after-ms:1000}")
    private long evidencePaddingAfterMs;
    @Value("${anomaly.evidence.dir:./data/anomaly-evidence}")
    private String evidenceDir;

    /**
     * 封装当前类中的一段独立业务步骤，减少调用方直接处理过多细节。
     * 阅读这个方法时，可以重点关注它读取了哪些输入、修改了哪些状态，以及异常或边界条件如何处理。
     */
    @PostConstruct
    public void seedDefaults() {
        seed("base", "serverPort", serverPort, "STRING");
        seed("base", "corsOrigins", corsOrigins, "STRING");
        seed("base", "faceBase", faceBase, "STRING");
        seed("base", "anomalyBase", anomalyBase, "STRING");

        seed("mail", "enabled", mailEnabled, "BOOLEAN");
        seed("mail", "host", mailHost, "STRING");
        seed("mail", "port", mailPort, "INT");
        seed("mail", "username", mailUsername, "STRING");
        seed("mail", "from", firstNonBlank(springMailFrom, legacyMailFrom), "STRING");

        seed("face", "verifyThreshold", faceVerifyThreshold, "DOUBLE");
        seed("face", "minDetScore", minFaceDetScore, "DOUBLE");

        seed("anomaly", "minDurationMs", anomalyMinDurationMs, "LONG");
        seed("anomaly", "maxReconnectCount", maxReconnectCount, "INT");

        seed("evidence", "videoFormat", evidenceVideoFormat, "STRING");
        seed("evidence", "paddingBeforeMs", evidencePaddingBeforeMs, "LONG");
        seed("evidence", "paddingAfterMs", evidencePaddingAfterMs, "LONG");

        seed("security", "passwordMinLength", 8, "INT");
        seed("security", "passwordRequireLetter", true, "BOOLEAN");
        seed("security", "passwordRequireNumber", true, "BOOLEAN");
        seed("security", "maxLoginAttempts", 5, "INT");
        seed("security", "lockMinutes", 15, "INT");

        seed("storage", "evidenceDir", evidenceDir, "STRING");
        seed("storage", "evidenceRetentionDays", 180, "INT");
        seed("storage", "recordingRetentionDays", 30, "INT");
        seed("storage", "cleanupEnabled", true, "BOOLEAN");
        seed("storage", "cleanupMode", "DELETE_EXPIRED", "STRING");
        seed("storage", "warningThresholdGb", 20, "INT");
    }

    /**
     * 读取或查询当前业务场景下需要的数据。
     * 阅读这个方法时，可以重点关注它读取了哪些输入、修改了哪些状态，以及异常或边界条件如何处理。
     */
    public Map<String, Object> getGroupedSettings() {
        Map<String, Object> grouped = new LinkedHashMap<>();
        for (PlatformSettingEntity entity : listAll()) {
            Map<String, Object> group = castMap(grouped.computeIfAbsent(entity.getSettingGroup(), key -> new LinkedHashMap<>()));
            group.put(entity.getSettingKey(), convert(entity.getSettingValue(), entity.getValueType()));
        }
        return grouped;
    }

    /**
     * 更新当前业务状态，并把变更写回数据库、内存或界面状态。
     * 阅读这个方法时，可以重点关注它读取了哪些输入、修改了哪些状态，以及异常或边界条件如何处理。
     */
    public void updateGroup(String group, Map<String, Object> values, Long actorUserId) {
        if (group == null || values == null) {
            return;
        }
        values.forEach((key, value) -> upsert(group, key, value, inferValueType(value), actorUserId));
    }

    /**
     * 读取或查询当前业务场景下需要的数据。
     * 阅读这个方法时，可以重点关注它读取了哪些输入、修改了哪些状态，以及异常或边界条件如何处理。
     */
    public int getInt(String group, String key, int defaultValue) {
        Object value = getValue(group, key);
        if (value instanceof Number number) {
            return number.intValue();
        }
        return value == null ? defaultValue : Integer.parseInt(String.valueOf(value));
    }

    /**
     * 读取或查询当前业务场景下需要的数据。
     * 阅读这个方法时，可以重点关注它读取了哪些输入、修改了哪些状态，以及异常或边界条件如何处理。
     */
    public long getLong(String group, String key, long defaultValue) {
        Object value = getValue(group, key);
        if (value instanceof Number number) {
            return number.longValue();
        }
        return value == null ? defaultValue : Long.parseLong(String.valueOf(value));
    }

    /**
     * 读取或查询当前业务场景下需要的数据。
     * 阅读这个方法时，可以重点关注它读取了哪些输入、修改了哪些状态，以及异常或边界条件如何处理。
     */
    public double getDouble(String group, String key, double defaultValue) {
        Object value = getValue(group, key);
        if (value instanceof Number number) {
            return number.doubleValue();
        }
        return value == null ? defaultValue : Double.parseDouble(String.valueOf(value));
    }

    /**
     * 读取或查询当前业务场景下需要的数据。
     * 阅读这个方法时，可以重点关注它读取了哪些输入、修改了哪些状态，以及异常或边界条件如何处理。
     */
    public boolean getBoolean(String group, String key, boolean defaultValue) {
        Object value = getValue(group, key);
        if (value instanceof Boolean bool) {
            return bool;
        }
        return value == null ? defaultValue : Boolean.parseBoolean(String.valueOf(value));
    }

    /**
     * 读取或查询当前业务场景下需要的数据。
     * 阅读这个方法时，可以重点关注它读取了哪些输入、修改了哪些状态，以及异常或边界条件如何处理。
     */
    public String getString(String group, String key, String defaultValue) {
        Object value = getValue(group, key);
        return value == null ? defaultValue : String.valueOf(value);
    }

    /**
     * 读取或查询当前业务场景下需要的数据。
     * 阅读这个方法时，可以重点关注它读取了哪些输入、修改了哪些状态，以及异常或边界条件如何处理。
     */
    private Object getValue(String group, String key) {
        PlatformSettingEntity entity = platformSettingMapper.selectOne(new LambdaQueryWrapper<PlatformSettingEntity>()
                .eq(PlatformSettingEntity::getSettingGroup, group)
                .eq(PlatformSettingEntity::getSettingKey, key)
                .last("limit 1"));
        return entity == null ? null : convert(entity.getSettingValue(), entity.getValueType());
    }

    /**
     * 封装当前类中的一段独立业务步骤，减少调用方直接处理过多细节。
     * 阅读这个方法时，可以重点关注它读取了哪些输入、修改了哪些状态，以及异常或边界条件如何处理。
     */
    private void seed(String group, String key, Object value, String valueType) {
        PlatformSettingEntity existed = platformSettingMapper.selectOne(new LambdaQueryWrapper<PlatformSettingEntity>()
                .eq(PlatformSettingEntity::getSettingGroup, group)
                .eq(PlatformSettingEntity::getSettingKey, key)
                .last("limit 1"));
        if (existed != null) {
            return;
        }
        upsert(group, key, value, valueType, null);
    }

    /**
     * 封装当前类中的一段独立业务步骤，减少调用方直接处理过多细节。
     * 阅读这个方法时，可以重点关注它读取了哪些输入、修改了哪些状态，以及异常或边界条件如何处理。
     */
    private void upsert(String group, String key, Object value, String valueType, Long actorUserId) {
        PlatformSettingEntity entity = platformSettingMapper.selectOne(new LambdaQueryWrapper<PlatformSettingEntity>()
                .eq(PlatformSettingEntity::getSettingGroup, group)
                .eq(PlatformSettingEntity::getSettingKey, key)
                .last("limit 1"));
        if (entity == null) {
            entity = new PlatformSettingEntity();
            entity.setSettingGroup(group);
            entity.setSettingKey(key);
        }
        entity.setSettingValue(value == null ? null : String.valueOf(value));
        entity.setValueType(valueType);
        entity.setUpdatedByUserId(actorUserId);
        entity.setUpdatedAt(LocalDateTime.now());
        if (entity.getId() == null) {
            platformSettingMapper.insert(entity);
        } else {
            platformSettingMapper.updateById(entity);
        }
    }

    /**
     * 读取或查询当前业务场景下需要的数据。
     * 阅读这个方法时，可以重点关注它读取了哪些输入、修改了哪些状态，以及异常或边界条件如何处理。
     */
    private List<PlatformSettingEntity> listAll() {
        return platformSettingMapper.selectList(new LambdaQueryWrapper<PlatformSettingEntity>()
                .orderByAsc(PlatformSettingEntity::getSettingGroup, PlatformSettingEntity::getSettingKey));
    }

    /**
     * 封装当前类中的一段独立业务步骤，减少调用方直接处理过多细节。
     * 阅读这个方法时，可以重点关注它读取了哪些输入、修改了哪些状态，以及异常或边界条件如何处理。
     */
    @SuppressWarnings("unchecked")
    private Map<String, Object> castMap(Object value) {
        return (Map<String, Object>) value;
    }

    /**
     * 封装当前类中的一段独立业务步骤，减少调用方直接处理过多细节。
     * 阅读这个方法时，可以重点关注它读取了哪些输入、修改了哪些状态，以及异常或边界条件如何处理。
     */
    private Object convert(String value, String valueType) {
        if (value == null) {
            return null;
        }
        String normalized = valueType == null ? "STRING" : valueType.toUpperCase(Locale.ROOT);
        return switch (normalized) {
            case "BOOLEAN" -> Boolean.parseBoolean(value);
            case "INT" -> Integer.parseInt(value);
            case "LONG" -> Long.parseLong(value);
            case "DOUBLE" -> Double.parseDouble(value);
            default -> value;
        };
    }

    /**
     * 封装当前类中的一段独立业务步骤，减少调用方直接处理过多细节。
     * 阅读这个方法时，可以重点关注它读取了哪些输入、修改了哪些状态，以及异常或边界条件如何处理。
     */
    private String inferValueType(Object value) {
        if (value instanceof Boolean) return "BOOLEAN";
        if (value instanceof Integer) return "INT";
        if (value instanceof Long) return "LONG";
        if (value instanceof Float || value instanceof Double) return "DOUBLE";
        return "STRING";
    }

    /**
     * 封装当前类中的一段独立业务步骤，减少调用方直接处理过多细节。
     * 阅读这个方法时，可以重点关注它读取了哪些输入、修改了哪些状态，以及异常或边界条件如何处理。
     */
    private String firstNonBlank(String... values) {
        if (values == null) {
            return "";
        }
        for (String value : values) {
            if (!Objects.toString(value, "").isBlank()) {
                return value.trim();
            }
        }
        return "";
    }
}
