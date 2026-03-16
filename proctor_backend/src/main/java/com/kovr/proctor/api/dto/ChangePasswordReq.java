package com.kovr.proctor.api.dto;

import jakarta.validation.constraints.NotBlank;

public record ChangePasswordReq(
        @NotBlank String oldPassword,
        @NotBlank String newPassword
) {
}
