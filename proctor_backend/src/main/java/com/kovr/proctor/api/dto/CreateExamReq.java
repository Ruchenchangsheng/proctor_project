package com.kovr.proctor.api.dto;

import java.time.LocalDateTime;
import java.util.List;
/**
 * CreateExamReq 用于承载接口层传入或返回的数据，方便前端与后端围绕固定字段结构交换信息。
 * 字段说明：
 * - name: 展示给用户看的名称字段，具体含义取决于所在对象，例如学校名、考试名或人员姓名。
 * - departmentId: 所属院系主键，用来约束教师、学生或考试的组织范围。
 * - majorId: 所属专业主键，细化到院系下的专业维度。
 * - startAt: 开始时间字段，通常表示考试或任务的计划开始时间。
 * - endAt: 结束时间字段，通常表示考试或任务的计划结束时间。
 * - invigilatorScreenWidth: 该字段承载当前对象的一项业务属性，阅读时可以结合它所在类和数据库表一起理解。
 * - invigilatorScreenHeight: 该字段承载当前对象的一项业务属性，阅读时可以结合它所在类和数据库表一起理解。
 * - minStudentTileWidth: 该字段承载当前对象的一项业务属性，阅读时可以结合它所在类和数据库表一起理解。
 * - minStudentTileHeight: 该字段承载当前对象的一项业务属性，阅读时可以结合它所在类和数据库表一起理解。
 * - hardCapPerRoom: 该字段承载当前对象的一项业务属性，阅读时可以结合它所在类和数据库表一起理解。
 * - studentEmails: 参与考试的学生邮箱列表，后端会据此批量创建或匹配考试会话。
 */

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
