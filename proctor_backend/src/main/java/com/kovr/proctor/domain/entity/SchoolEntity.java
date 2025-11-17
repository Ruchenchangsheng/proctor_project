package com.kovr.proctor.domain.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

@Data
@TableName("schools")
public class SchoolEntity {
    @TableId(type = IdType.AUTO)
    private Long id;
    private String name;
    private String domain;
}
