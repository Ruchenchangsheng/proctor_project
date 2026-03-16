package com.kovr.proctor.domain.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("recording_segments")
public class RecordingSegmentEntity {
    @TableId(type = IdType.AUTO)
    private Long id;
    private String segmentId;
    private Long sessionId;
    private Long examRoomId;
    private Long studentId;
    private Long schoolId;
    private Long chunkStartTsMs;
    private Long chunkEndTsMs;
    private String filePath;
    private String mediaType;
    private LocalDateTime createdAt;
}
