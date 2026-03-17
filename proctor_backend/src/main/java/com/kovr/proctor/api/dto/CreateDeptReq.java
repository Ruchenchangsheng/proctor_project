package com.kovr.proctor.api.dto;

import jakarta.validation.constraints.NotBlank;
/**
 * CreateDeptReq 用于承载接口层传入或返回的数据，方便前端与后端围绕固定字段结构交换信息。
 * 字段说明：
 * - name: 展示给用户看的名称字段，具体含义取决于所在对象，例如学校名、考试名或人员姓名。
 */

public record CreateDeptReq(@NotBlank String name) {
}
