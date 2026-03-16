package com.kovr.proctor.domain.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("notification_templates")
public class NotificationTemplateEntity {
    @TableId(type = IdType.AUTO)
    private Long id;
    private String templateCode;
    private String channel;
    private String subject;
    private String content;
    private Integer enabled;
    private Long updatedByUserId;
    private LocalDateTime updatedAt;
}
