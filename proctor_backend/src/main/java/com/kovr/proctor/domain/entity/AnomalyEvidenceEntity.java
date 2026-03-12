package com.kovr.proctor.domain.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("anomaly_evidences")
public class AnomalyEvidenceEntity {
    @TableId(type = IdType.AUTO)
    private Long id;
    private String evidenceId;
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
    private LocalDateTime anomalyAt;
    private Long anomalyTsMs;
    private String filePath;
    private String mediaType;
    private String mediaExt;
    private Integer frameCount;
    private LocalDateTime createdAt;
}
