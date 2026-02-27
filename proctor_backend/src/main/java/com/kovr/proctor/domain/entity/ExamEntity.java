package com.kovr.proctor.domain.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("exams")
public class ExamEntity {
    @TableId(type = IdType.AUTO)
    private Long id;
    private Long schoolId;
    private String name;
    private String roomCode;
    private LocalDateTime startAt;
    private LocalDateTime endAt;
    private String status;
    private Long createdBy;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
