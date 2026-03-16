package com.kovr.proctor.api.dto;

import jakarta.validation.constraints.NotNull;

public record ToggleEnabledReq(@NotNull Boolean enabled) {
}
