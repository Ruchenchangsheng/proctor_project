package com.kovr.proctor.domain.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;
/**
 * AnomalySegmentLinkEntity 对应数据库中的一类持久化记录，字段基本都会直接映射到表列或查询结果。
 * 字段说明：
 * - id: 当前记录在对应数据表中的主键标识。
 * - taskId: 该字段承载当前对象的一项业务属性，阅读时可以结合它所在类和数据库表一起理解。
 * - segmentId: 该字段承载当前对象的一项业务属性，阅读时可以结合它所在类和数据库表一起理解。
 * - createdAt: 记录创建时间，方便审计和排序。
 */

@Data
@TableName("anomaly_segment_links")
public class AnomalySegmentLinkEntity {
    @TableId(type = IdType.AUTO)
    private Long id;
    private String taskId;
    private String segmentId;
    private LocalDateTime createdAt;
}
