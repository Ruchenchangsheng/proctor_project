package com.kovr.proctor.domain.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;
/**
 * StudentEntity 对应数据库中的一类持久化记录，字段基本都会直接映射到表列或查询结果。
 * 字段说明：
 * - userId: 关联到 users 表的账号主键，用来把业务档案和登录账号绑定起来。
 * - schoolId: 该记录所属学校的主键，很多跨学校查询都会以它作为过滤条件。
 * - departmentId: 所属院系主键，用来约束教师、学生或考试的组织范围。
 * - majorId: 所属专业主键，细化到院系下的专业维度。
 * - facePhoto: 学生登记照片的二进制内容，通常用于人脸注册与展示。
 * - facePhotoMime: 证件照或人脸照片的 MIME 类型，便于浏览器正确显示。
 * - facePhotoSha256: 该字段承载当前对象的一项业务属性，阅读时可以结合它所在类和数据库表一起理解。
 * - faceEmbeddingJson: 人脸特征向量的 JSON 序列化结果，用来做后续 1:1 身份核验。
 * - faceEmbeddingDim: 该字段承载当前对象的一项业务属性，阅读时可以结合它所在类和数据库表一起理解。
 * - faceDetScore: 评分或相似度结果，常用于人脸核验、异常强度或检测置信度。
 * - createdAt: 记录创建时间，方便审计和排序。
 * - updatedAt: 记录最后更新时间，方便判断最近一次变更。
 */

@Data
@TableName("students")
public class StudentEntity {
    @TableId(value = "user_id",type = IdType.INPUT)
    private Long userId;
    private Long schoolId;
    private Long departmentId;
    private Long majorId;
    private byte[] facePhoto;
    private String facePhotoMime;
    private String facePhotoSha256;
    private String faceEmbeddingJson;
    private Short faceEmbeddingDim;
    private BigDecimal faceDetScore;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}