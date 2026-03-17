package com.kovr.proctor.domain.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
/**
 * DepartmentEntity 对应数据库中的一类持久化记录，字段基本都会直接映射到表列或查询结果。
 * 字段说明：
 * - id: 当前记录在对应数据表中的主键标识。
 * - schoolId: 该记录所属学校的主键，很多跨学校查询都会以它作为过滤条件。
 * - name: 展示给用户看的名称字段，具体含义取决于所在对象，例如学校名、考试名或人员姓名。
 */

@Data
@TableName("departments")
public class DepartmentEntity {
    @TableId(type = IdType.AUTO)
    private Long id;
    private Long schoolId;
    private String name;
}