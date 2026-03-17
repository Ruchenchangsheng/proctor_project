package com.kovr.proctor.domain.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
/**
 * ExamRoomEnrollmentEntity 对应数据库中的一类持久化记录，字段基本都会直接映射到表列或查询结果。
 * 字段说明：
 * - id: 当前记录在对应数据表中的主键标识。
 * - examRoomId: 关联监考房间/考场主键，实时监考和证据检索都会用到它。
 * - studentId: 关联学生的业务主键或账号主键，方便把考试数据回溯到具体学生。
 */

@Data
@TableName("exam_room_enrollments")
public class ExamRoomEnrollmentEntity {
    @TableId(type = IdType.AUTO)
    private Long id;
    private Long examRoomId;
    private Long studentId;
}
