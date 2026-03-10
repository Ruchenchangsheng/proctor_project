package com.kovr.proctor.domain.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

@Data
@TableName("majors")
public class MajorEntity {
    @TableId(type = IdType.AUTO)
    private Long id;
    private Long departmentId;
    private String name;
}
