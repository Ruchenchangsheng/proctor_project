package com.kovr.proctor.common;

public class BusinessException extends RuntimeException {
    public final String code;

    public BusinessException(String code, String msg) {
        super(msg);
        this.code = code;
    }
    public String getCode() {
        return code;
    }
}
