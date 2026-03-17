package com.kovr.proctor.domain.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;
/**
 * NotificationTemplateEntity 对应数据库中的一类持久化记录，字段基本都会直接映射到表列或查询结果。
 * 字段说明：
 * - id: 当前记录在对应数据表中的主键标识。
 * - templateCode: 该字段承载当前对象的一项业务属性，阅读时可以结合它所在类和数据库表一起理解。
 * - channel: 该字段承载当前对象的一项业务属性，阅读时可以结合它所在类和数据库表一起理解。
 * - subject: 该字段承载当前对象的一项业务属性，阅读时可以结合它所在类和数据库表一起理解。
 * - content: 该字段承载当前对象的一项业务属性，阅读时可以结合它所在类和数据库表一起理解。
 * - enabled: 启停用状态，1/0 或 true/false 通常分别表示可登录和被冻结。
 * - updatedByUserId: 关联到 users 表的账号主键，用来把业务档案和登录账号绑定起来。
 * - updatedAt: 记录最后更新时间，方便判断最近一次变更。
 */

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
