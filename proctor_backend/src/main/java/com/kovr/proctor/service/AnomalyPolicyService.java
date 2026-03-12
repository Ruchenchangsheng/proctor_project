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

    @Value("${anomaly.evidence.default-media-type:VIDEO}")
    private String defaultEvidenceMediaType;

    public Policy getPolicy(Long schoolId) {
        if (schoolId == null) {
            return defaultPolicy();
        }
        return policyBySchool.getOrDefault(schoolId, defaultPolicy());
    }

    public Policy updatePolicy(Long schoolId, Double warningThreshold, Double severeThreshold, Long sampleIntervalMs, Long identityVerifyIntervalSec, String evidenceMediaType) {
        Policy current = getPolicy(schoolId);
        double nextWarning = normalize(warningThreshold == null ? current.warningThreshold() : warningThreshold);
        double nextSevere = normalize(severeThreshold == null ? current.severeThreshold() : severeThreshold);
        long nextSampleMs = normalizeMs(sampleIntervalMs == null ? current.sampleIntervalMs() : sampleIntervalMs);
        long nextIdentitySec = normalizeSec(identityVerifyIntervalSec == null ? current.identityVerifyIntervalSec() : identityVerifyIntervalSec);
        String nextMediaType = normalizeMediaType(evidenceMediaType == null ? current.evidenceMediaType() : evidenceMediaType);
        if (nextSevere < nextWarning) {
            nextSevere = nextWarning;
        }
        Policy next = new Policy(nextWarning, nextSevere, nextSampleMs, nextIdentitySec, nextMediaType);
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
                "evidenceMediaType", p.evidenceMediaType()
        );
    }

    private Policy defaultPolicy() {
        double warning = normalize(defaultWarningThreshold);
        double severe = normalize(defaultSevereThreshold);
        if (severe < warning) severe = warning;
        return new Policy(warning, severe, normalizeMs(defaultSampleIntervalMs), normalizeSec(defaultIdentityVerifyIntervalSec), normalizeMediaType(defaultEvidenceMediaType));
    }


    private long normalizeMs(long v) {
        if (v < 200L) return 200L;
        if (v > 10000L) return 10000L;
        return v;
    }

    private long normalizeSec(long v) {
        if (v < 2L) return 2L;
        if (v > 120L) return 120L;
        return v;
    }

    private String normalizeMediaType(String value) {
        if (value == null) return "VIDEO";
        String v = value.trim().toUpperCase();
        return "GIF".equals(v) ? "GIF" : "VIDEO";
    }

    private double normalize(double v) {
        if (Double.isNaN(v)) return 0.65d;
        if (v < 0d) return 0d;
        if (v > 1d) return 1d;
        return v;
    }

    public record Policy(double warningThreshold, double severeThreshold, long sampleIntervalMs, long identityVerifyIntervalSec, String evidenceMediaType) {}
}
