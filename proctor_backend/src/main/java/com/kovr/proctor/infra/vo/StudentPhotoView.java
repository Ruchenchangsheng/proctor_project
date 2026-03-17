package com.kovr.proctor.infra.vo;

import lombok.Data;
/**
 * StudentPhotoView 表示从底层查询结果投影出的只读视图对象。
 */

@Data
public class StudentPhotoView {
    private byte[] facePhoto;
    private String facePhotoMime;
    private String facePhotoSha256;
}
