package com.kovr.proctor.domain.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;
/**
 * PlatformSettingEntity 对应数据库中的一类持久化记录，字段基本都会直接映射到表列或查询结果。
 * 字段说明：
 * - id: 当前记录在对应数据表中的主键标识。
 * - settingGroup: 该字段承载当前对象的一项业务属性，阅读时可以结合它所在类和数据库表一起理解。
 * - settingKey: 该字段承载当前对象的一项业务属性，阅读时可以结合它所在类和数据库表一起理解。
 * - settingValue: 该字段承载当前对象的一项业务属性，阅读时可以结合它所在类和数据库表一起理解。
 * - valueType: 当前记录的类型字段，帮助调用方区分不同子场景或不同事件类别。
 * - updatedByUserId: 关联到 users 表的账号主键，用来把业务档案和登录账号绑定起来。
 * - updatedAt: 记录最后更新时间，方便判断最近一次变更。
 */

@Data
@TableName("platform_settings")
public class PlatformSettingEntity {
    @TableId(type = IdType.AUTO)
    private Long id;
    private String settingGroup;
    private String settingKey;
    private String settingValue;
    private String valueType;
    private Long updatedByUserId;
    private LocalDateTime updatedAt;
}
