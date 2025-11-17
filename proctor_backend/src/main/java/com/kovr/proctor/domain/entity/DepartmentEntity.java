package com.kovr.proctor.domain.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

@Data
@TableName("departments")
public class DepartmentEntity {
    @TableId(type = IdType.AUTO)
    private Long id;
    private Long schoolId;
    private String name;
}