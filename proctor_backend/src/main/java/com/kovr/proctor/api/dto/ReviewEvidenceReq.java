package com.kovr.proctor.api.dto;

import jakarta.validation.constraints.NotBlank;

public record ReviewEvidenceReq(
        @NotBlank String reviewStatus,
        String reviewNote
) {
}
