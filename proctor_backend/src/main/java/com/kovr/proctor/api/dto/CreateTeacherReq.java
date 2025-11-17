package com.kovr.proctor.api.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

public record CreateTeacherReq(@Email @NotBlank String email, @NotBlank String name, @NotNull Long departmentId,
                               @NotNull Long majorId) {
}
