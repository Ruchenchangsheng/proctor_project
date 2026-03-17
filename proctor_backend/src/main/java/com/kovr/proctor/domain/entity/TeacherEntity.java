package com.kovr.proctor.domain.entity;

import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
/**
 * TeacherEntity 对应数据库中的一类持久化记录，字段基本都会直接映射到表列或查询结果。
 * 字段说明：
 * - userId: 关联到 users 表的账号主键，用来把业务档案和登录账号绑定起来。
 * - schoolId: 该记录所属学校的主键，很多跨学校查询都会以它作为过滤条件。
 * - departmentId: 所属院系主键，用来约束教师、学生或考试的组织范围。
 * - majorId: 所属专业主键，细化到院系下的专业维度。
 */

@Data
@TableName("teachers")
public class TeacherEntity {
    @TableId(value = "user_id")
    private Long userId;
    private Long schoolId;
    private Long departmentId;
    private Long majorId;
}
