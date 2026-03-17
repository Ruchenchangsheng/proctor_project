package com.kovr.proctor.common;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;
/**
 * ApiError 封装接口层和业务层都会复用的通用错误或基础能力。
 */

@Data
@NoArgsConstructor
@AllArgsConstructor
public class ApiError {
    private String error;
    private String message;
    private String code;
    private Object details;
}
