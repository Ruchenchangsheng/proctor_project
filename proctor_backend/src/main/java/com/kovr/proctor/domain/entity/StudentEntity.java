package com.kovr.proctor.domain.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

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