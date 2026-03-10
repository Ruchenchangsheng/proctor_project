package com.kovr.proctor.api.dto;

import jakarta.validation.constraints.NotBlank;

public record CreateDeptReq(@NotBlank String name) {
}
