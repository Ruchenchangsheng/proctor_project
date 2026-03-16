package com.kovr.proctor.api.dto;

import java.time.LocalDateTime;

public record UpdateExamReq(
        String name,
        LocalDateTime startAt,
        LocalDateTime endAt
) {
}
