package com.kovr.proctor.api.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
/**
 * CreateSchoolReq 用于承载接口层传入或返回的数据，方便前端与后端围绕固定字段结构交换信息。
 * 字段说明：
 * - schoolName: 展示给用户看的名称字段，具体含义取决于所在对象，例如学校名、考试名或人员姓名。
 * - adminName: 展示给用户看的名称字段，具体含义取决于所在对象，例如学校名、考试名或人员姓名。
 * - adminEmail: 登录邮箱或联系邮箱字段，系统内很多账号以它作为唯一登录名。
 * - domain: 学校邮箱域名或业务域，用来约束学校管理员及师生账号的邮箱范围。
 */

public record CreateSchoolReq(@NotBlank String schoolName, @NotBlank String adminName,
                              @Email @NotBlank String adminEmail,@Email@NotBlank String domain) {
}
