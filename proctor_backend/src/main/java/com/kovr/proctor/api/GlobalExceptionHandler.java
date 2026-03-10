package com.kovr.proctor.api;

import com.kovr.proctor.common.BusinessException;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.util.LinkedHashMap;
import java.util.Map;

@RestControllerAdvice
@Slf4j
public class GlobalExceptionHandler {

    /** 业务异常：HTTP 400，返回中文提示 */
    @ExceptionHandler(BusinessException.class)
    public ResponseEntity<Map<String, Object>> handleBusiness(BusinessException ex) {
        log.warn("业务异常：{} - {}", ex.getClass().getSimpleName(), ex.getMessage());
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("成功", false);
        body.put("错误类型", ex.getClass().getSimpleName());
        body.put("错误码", ex.getCode());
        body.put("错误信息", ex.getMessage());
        return ResponseEntity.badRequest().body(body);
    }

    /** 兜底异常：HTTP 500，返回中文提示 */
    @ExceptionHandler(Exception.class)
    public ResponseEntity<Map<String, Object>> handleAny(Exception ex) {
        log.error("服务器内部错误：", ex);
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("成功", false);
        body.put("错误类型", ex.getClass().getSimpleName());
        body.put("错误信息", ex.getMessage());
        body.put("提示", "服务器内部错误，请联系管理员或稍后重试");
        return ResponseEntity.status(500).body(body);
    }
}
