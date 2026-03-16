package com.kovr.proctor.domain.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("audit_logs")
public class AuditLogEntity {
    @TableId(type = IdType.AUTO)
    private Long id;
    private Long actorUserId;
    private String actorRole;
    private String actorName;
    private String actionType;
    private String targetType;
    private String targetId;
    private String summary;
    private String detail;
    private LocalDateTime createdAt;
}
