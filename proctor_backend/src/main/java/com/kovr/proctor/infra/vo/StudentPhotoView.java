package com.kovr.proctor.infra.vo;

import lombok.Data;

@Data
public class StudentPhotoView {
    private byte[] facePhoto;
    private String facePhotoMime;
    private String facePhotoSha256;
}
