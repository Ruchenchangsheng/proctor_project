package com.kovr.proctor.domain.entity;


import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;
/**
 * ExamEntity 对应数据库中的一类持久化记录，字段基本都会直接映射到表列或查询结果。
 * 字段说明：
 * - id: 当前记录在对应数据表中的主键标识。
 * - schoolId: 该记录所属学校的主键，很多跨学校查询都会以它作为过滤条件。
 * - departmentId: 所属院系主键，用来约束教师、学生或考试的组织范围。
 * - majorId: 所属专业主键，细化到院系下的专业维度。
 * - name: 展示给用户看的名称字段，具体含义取决于所在对象，例如学校名、考试名或人员姓名。
 * - startAt: 开始时间字段，通常表示考试或任务的计划开始时间。
 * - endAt: 结束时间字段，通常表示考试或任务的计划结束时间。
 * - createdBy: 该字段承载当前对象的一项业务属性，阅读时可以结合它所在类和数据库表一起理解。
 */

@Data
@TableName("exams")
public class ExamEntity {
    @TableId(type = IdType.AUTO)
    private Long id;
    private Long schoolId;
    private Long departmentId;
    private Long majorId;
    private String name;
    private LocalDateTime startAt;
    private LocalDateTime endAt;
    private Long createdBy;
}
