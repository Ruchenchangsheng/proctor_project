package com.kovr.proctor.domain.entity;

import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

@Data
@TableName("teachers")
public class TeacherEntity {
    @TableId(value = "user_id")
    private Long userId;
    private Long schoolId;
    private Long departmentId;
    private Long majorId;
}
