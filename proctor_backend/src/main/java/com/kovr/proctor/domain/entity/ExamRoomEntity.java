package com.kovr.proctor.domain.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
/**
 * ExamRoomEntity 对应数据库中的一类持久化记录，字段基本都会直接映射到表列或查询结果。
 * 字段说明：
 * - id: 当前记录在对应数据表中的主键标识。
 * - examId: 关联考试主键，表示这条记录归属于哪一场考试。
 * - roomId: 该字段承载当前对象的一项业务属性，阅读时可以结合它所在类和数据库表一起理解。
 * - invigilatorId: 监考教师主键，用来定位当前场次由哪位教师负责。
 * - capacity: 该字段承载当前对象的一项业务属性，阅读时可以结合它所在类和数据库表一起理解。
 */

@Data
@TableName("exam_rooms")
public class ExamRoomEntity {
    @TableId(type = IdType.AUTO)
    private Long id;
    private Long examId;
    private String roomId;
    private Long invigilatorId;
    private Integer capacity;
}
