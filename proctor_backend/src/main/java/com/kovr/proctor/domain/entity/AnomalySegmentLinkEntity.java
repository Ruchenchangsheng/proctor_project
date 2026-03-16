package com.kovr.proctor.domain.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("anomaly_segment_links")
public class AnomalySegmentLinkEntity {
    @TableId(type = IdType.AUTO)
    private Long id;
    private String taskId;
    private String segmentId;
    private LocalDateTime createdAt;
}
