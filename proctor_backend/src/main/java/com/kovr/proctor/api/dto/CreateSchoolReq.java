package com.kovr.proctor.api.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;

public record CreateSchoolReq(@NotBlank String schoolName, @NotBlank String adminName,
                              @Email @NotBlank String adminEmail,@Email@NotBlank String domain) {
}
