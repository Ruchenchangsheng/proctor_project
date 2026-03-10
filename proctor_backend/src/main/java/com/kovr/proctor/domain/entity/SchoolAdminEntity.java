package com.kovr.proctor.domain.entity;

import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("school_admin")
public class SchoolAdminEntity {
    @TableId(value = "user_id")
    private Long userId;
    private Long schoolId;
    private LocalDateTime createdAt;
}
