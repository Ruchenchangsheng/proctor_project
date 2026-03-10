package com.kovr.proctor.api.dto;

public record UpdateAnomalyPolicyReq(
        Double warningThreshold,
        Double severeThreshold,
        Long sampleIntervalMs,
        Long identityVerifyIntervalSec
) {
}
