package com.kovr.proctor.api.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;

import java.time.LocalDateTime;
import java.util.List;

public record CreateExamReq(
        @NotBlank String name,
        @NotBlank String roomCode,
        @NotNull LocalDateTime startAt,
        @NotNull LocalDateTime endAt,
        @NotEmpty List<Long> teacherIds,
        @NotEmpty List<Long> studentIds
) {
}
