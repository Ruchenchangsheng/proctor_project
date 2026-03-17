package com.kovr.proctor.api.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
/**
 * CreateTeacherReq 用于承载接口层传入或返回的数据，方便前端与后端围绕固定字段结构交换信息。
 * 字段说明：
 * - email: 登录邮箱或联系邮箱字段，系统内很多账号以它作为唯一登录名。
 * - name: 展示给用户看的名称字段，具体含义取决于所在对象，例如学校名、考试名或人员姓名。
 * - departmentId: 所属院系主键，用来约束教师、学生或考试的组织范围。
 * - majorId: 所属专业主键，细化到院系下的专业维度。
 */

public record CreateTeacherReq(@Email @NotBlank String email, @NotBlank String name, @NotNull Long departmentId,
                               @NotNull Long majorId) {
}
