package com.kovr.proctor.domain.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;
/**
 * AuditLogEntity 对应数据库中的一类持久化记录，字段基本都会直接映射到表列或查询结果。
 * 字段说明：
 * - id: 当前记录在对应数据表中的主键标识。
 * - actorUserId: 关联到 users 表的账号主键，用来把业务档案和登录账号绑定起来。
 * - actorRole: 用户角色，用于前后端共同判断权限和页面入口。
 * - actorName: 展示给用户看的名称字段，具体含义取决于所在对象，例如学校名、考试名或人员姓名。
 * - actionType: 当前记录的类型字段，帮助调用方区分不同子场景或不同事件类别。
 * - targetType: 当前记录的类型字段，帮助调用方区分不同子场景或不同事件类别。
 * - targetId: 该字段承载当前对象的一项业务属性，阅读时可以结合它所在类和数据库表一起理解。
 * - summary: 该字段承载当前对象的一项业务属性，阅读时可以结合它所在类和数据库表一起理解。
 * - detail: 该字段承载当前对象的一项业务属性，阅读时可以结合它所在类和数据库表一起理解。
 * - createdAt: 记录创建时间，方便审计和排序。
 */

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
