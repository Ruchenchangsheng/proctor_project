package com.kovr.proctor.domain.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("exam_sessions")
public class ExamSessionEntity {
    @TableId(type = IdType.AUTO)
    private Long id;
    private Long examId;
    private Long schoolId;
    private Long departmentId;
    private Long majorId;
    private Long examRoomId;
    private Long invigilatorId;
    private Long studentId;
    private String status;
    private Double lastVerifyScore;
    private LocalDateTime lastVerifyAt;
    private LocalDateTime enteredAt;
    private LocalDateTime finishedAt;
}

