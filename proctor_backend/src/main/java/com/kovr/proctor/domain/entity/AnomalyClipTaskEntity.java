package com.kovr.proctor.domain.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("anomaly_clip_tasks")
public class AnomalyClipTaskEntity {
    @TableId(type = IdType.AUTO)
    private Long id;
    private String taskId;
    private Long examRoomId;
    private Long studentId;
    private Long schoolId;
    private Long examId;
    private Long sessionId;
    private String examName;
    private String roomId;
    private String studentName;
    private String invigilatorName;
    private String anomalyLabel;
    private String severity;
    private Long anomalyTsMs;
    private Long anomalyStartTsMs;
    private Long anomalyEndTsMs;
    private String status;
    private String evidenceId;
    private String errorMsg;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
