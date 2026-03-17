package com.kovr.proctor.api.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
/**
 * LoginReq 用于承载接口层传入或返回的数据，方便前端与后端围绕固定字段结构交换信息。
 * 字段说明：
 * - email: 登录邮箱或联系邮箱字段，系统内很多账号以它作为唯一登录名。
 * - password: 密码相关字段；在持久化对象中通常保存加密后的口令，在请求对象中通常表示用户输入。
 */

public record LoginReq(@Email @NotBlank String email, @NotBlank String password) {
}

