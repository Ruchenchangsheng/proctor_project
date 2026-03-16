package com.kovr.proctor.api.dto;

public record UpdateSchoolReq(
        String schoolName,
        String domain,
        String adminName,
        String adminEmail) {
}
