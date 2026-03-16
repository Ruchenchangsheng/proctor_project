package com.kovr.proctor.domain.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

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
