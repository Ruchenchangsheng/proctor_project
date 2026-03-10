package com.kovr.proctor.domain.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

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
