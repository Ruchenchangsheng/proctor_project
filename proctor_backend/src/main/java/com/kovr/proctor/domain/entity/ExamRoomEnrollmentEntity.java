package com.kovr.proctor.domain.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

@Data
@TableName("exam_room_enrollments")
public class ExamRoomEnrollmentEntity {
    @TableId(type = IdType.AUTO)
    private Long id;
    private Long examRoomId;
    private Long studentId;
}
