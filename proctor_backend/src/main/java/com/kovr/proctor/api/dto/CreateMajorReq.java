package com.kovr.proctor.api.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

public record CreateMajorReq(@NotNull Long departmentId, @NotBlank String name) {
}

