package com.kovr.proctor.api.dto;

import java.time.LocalDateTime;
import java.util.List;

public record CreateExamReq(
        String name,
        Long departmentId,
        Long majorId,
        LocalDateTime startAt,
        LocalDateTime endAt,
        Integer invigilatorScreenWidth,
        Integer invigilatorScreenHeight,
        Integer minStudentTileWidth,
        Integer minStudentTileHeight,
        Integer hardCapPerRoom,
        List<String> studentEmails
) {
}
