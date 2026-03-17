package com.kovr.proctor.api.dto;

import jakarta.validation.constraints.NotBlank;
/**
 * ReviewEvidenceReq 用于承载接口层传入或返回的数据，方便前端与后端围绕固定字段结构交换信息。
 * 字段说明：
 * - reviewStatus: 当前业务状态字段，例如考试状态、审核状态或任务状态。
 * - reviewNote: 审核备注，记录人工审查时留下的判断说明。
 */

public record ReviewEvidenceReq(
        @NotBlank String reviewStatus,
        String reviewNote
) {
}
