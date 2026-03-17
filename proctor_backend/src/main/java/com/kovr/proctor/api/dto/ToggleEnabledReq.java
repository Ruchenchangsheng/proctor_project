package com.kovr.proctor.api.dto;

import jakarta.validation.constraints.NotNull;
/**
 * ToggleEnabledReq 用于承载接口层传入或返回的数据，方便前端与后端围绕固定字段结构交换信息。
 * 字段说明：
 * - enabled: 启停用状态，1/0 或 true/false 通常分别表示可登录和被冻结。
 */

public record ToggleEnabledReq(@NotNull Boolean enabled) {
}
