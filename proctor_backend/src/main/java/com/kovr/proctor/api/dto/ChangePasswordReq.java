package com.kovr.proctor.api.dto;

import jakarta.validation.constraints.NotBlank;
/**
 * ChangePasswordReq 用于承载接口层传入或返回的数据，方便前端与后端围绕固定字段结构交换信息。
 * 字段说明：
 * - oldPassword: 密码相关字段；在持久化对象中通常保存加密后的口令，在请求对象中通常表示用户输入。
 * - newPassword: 密码相关字段；在持久化对象中通常保存加密后的口令，在请求对象中通常表示用户输入。
 */

public record ChangePasswordReq(
        @NotBlank String oldPassword,
        @NotBlank String newPassword
) {
}
