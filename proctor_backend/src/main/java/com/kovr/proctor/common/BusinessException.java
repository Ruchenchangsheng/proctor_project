package com.kovr.proctor.common;
/**
 * BusinessException 封装接口层和业务层都会复用的通用错误或基础能力。
 */

public class BusinessException extends RuntimeException {
    public final String code;

    public BusinessException(String code, String msg) {
        super(msg);
        this.code = code;
    }
    /**
     * 读取或查询当前业务场景下需要的数据。
     * 阅读这个方法时，可以重点关注它读取了哪些输入、修改了哪些状态，以及异常或边界条件如何处理。
     */
    public String getCode() {
        return code;
    }
}
