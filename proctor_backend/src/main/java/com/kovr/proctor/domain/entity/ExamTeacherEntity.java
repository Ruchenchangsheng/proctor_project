package com.kovr.proctor.domain.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("exam_teachers")
public class ExamTeacherEntity {
    @TableId(type = IdType.AUTO)
    private Long id;
    private Long examId;
    private Long teacherId;
    private LocalDateTime createdAt;
}
