package com.kovr.proctor.api.dto;

import java.util.List;

public record EvidenceExportReq(List<String> evidenceIds) {
}
