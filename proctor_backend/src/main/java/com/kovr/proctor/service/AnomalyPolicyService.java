package com.kovr.proctor.service;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class AnomalyPolicyService {
    private final ConcurrentHashMap<Long, Policy> policyBySchool = new ConcurrentHashMap<>();

    @Value("${anomaly.warning-threshold:0.65}")
    private double defaultWarningThreshold;

    @Value("${anomaly.severe-threshold:0.85}")
    private double defaultSevereThreshold;

    @Value("${anomaly.sample-interval-ms:1000}")
    private long defaultSampleIntervalMs;

    @Value("${anomaly.identity-verify-interval-sec:8}")
    private long defaultIdentityVerifyIntervalSec;

    @Value("${anomaly.max-reconnect-count:3}")
    private int defaultMaxReconnectCount;

    public Policy getPolicy(Long schoolId) {
        if (schoolId == null) {
            return defaultPolicy();
        }
        return policyBySchool.getOrDefault(schoolId, defaultPolicy());
    }

    public Policy updatePolicy(Long schoolId, Double warningThreshold, Double severeThreshold, Long sampleIntervalMs, Long identityVerifyIntervalSec,  Integer maxReconnectCount) {
        Policy current = getPolicy(schoolId);
        double nextWarning = normalize(warningThreshold == null ? current.warningThreshold() : warningThreshold);
        double nextSevere = normalize(severeThreshold == null ? current.severeThreshold() : severeThreshold);
        long nextSampleMs = normalizeMs(sampleIntervalMs == null ? current.sampleIntervalMs() : sampleIntervalMs);
        long nextIdentitySec = normalizeSec(identityVerifyIntervalSec == null ? current.identityVerifyIntervalSec() : identityVerifyIntervalSec);

        int nextMaxReconnect = normalizeReconnectCount(maxReconnectCount == null ? current.maxReconnectCount() : maxReconnectCount);
        if (nextSevere < nextWarning) {
            nextSevere = nextWarning;
        }
        Policy next = new Policy(nextWarning, nextSevere, nextSampleMs, nextIdentitySec, nextMaxReconnect);
        if (schoolId != null) {
            policyBySchool.put(schoolId, next);
        }
        return next;
    }

    public Map<String, Object> asMap(Policy p) {
        return Map.of(
                "warningThreshold", p.warningThreshold(),
                "severeThreshold", p.severeThreshold(),
                "sampleIntervalMs", p.sampleIntervalMs(),
                "identityVerifyIntervalSec", p.identityVerifyIntervalSec(),
                "maxReconnectCount", p.maxReconnectCount()
        );
    }

    private Policy defaultPolicy() {
        double warning = normalize(defaultWarningThreshold);
        double severe = normalize(defaultSevereThreshold);
        if (severe < warning) severe = warning;
        return new Policy(warning, severe, normalizeMs(defaultSampleIntervalMs), normalizeSec(defaultIdentityVerifyIntervalSec), normalizeReconnectCount(defaultMaxReconnectCount));
    }


    private long normalizeMs(long v) {
        // 当前行为模型按 30fps 训练，线上采样固定锁定为 33ms，避免学校自行修改后破坏时序口径。
        return 33L;
    }

    private long normalizeSec(long v) {
        if (v < 2L) return 2L;
        if (v > 120L) return 120L;
        return v;
    }

    private int normalizeReconnectCount(int value) {
        if (value < 0) return 0;
        if (value > 20) return 20;
        return value;
    }

    private double normalize(double v) {
        if (Double.isNaN(v)) return 0.65d;
        if (v < 0d) return 0d;
        if (v > 1d) return 1d;
        return v;
    }

    public record Policy(double warningThreshold, double severeThreshold, long sampleIntervalMs, long identityVerifyIntervalSec, int maxReconnectCount) {}
}
