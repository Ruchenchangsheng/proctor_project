package com.kovr.proctor.api;

import com.kovr.proctor.common.BusinessException;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.util.LinkedHashMap;
import java.util.Map;

@RestControllerAdvice
@Slf4j
public class GlobalExceptionHandler {
    private String safe(String value) {
        if (value == null) return "";
        return value.replace("\\", "\\\\").replace("\"", "\\\"");
    }

    /** 业务异常：HTTP 400，返回统一 JSON 字符串，避免受已预设 Content-Type 干扰 */
    @ExceptionHandler(BusinessException.class)
    public ResponseEntity<String> handleBusiness(BusinessException ex) {
        log.warn("业务异常：{} - {}", ex.getClass().getSimpleName(), ex.getMessage());
        String body = String.format(
                "{\"success\":false,\"errorType\":\"%s\",\"errorCode\":\"%s\",\"message\":\"%s\"}",
                safe(ex.getClass().getSimpleName()),
                safe(ex.getCode()),
                safe(ex.getMessage()));
        return ResponseEntity.badRequest().contentType(MediaType.APPLICATION_JSON).body(body);
    }

    /** 兜底异常：HTTP 500，返回统一 JSON 字符串，避免 Map 在非常规 Content-Type 下无法写出 */
    @ExceptionHandler(Exception.class)
    public ResponseEntity<String> handleAny(Exception ex) {
        log.error("服务器内部错误：", ex);
        String body = String.format(
                "{\"success\":false,\"errorType\":\"%s\",\"message\":\"%s\",\"hint\":\"服务器内部错误，请联系管理员或稍后重试\"}",
                safe(ex.getClass().getSimpleName()),
                safe(ex.getMessage()));
        return ResponseEntity.status(500).contentType(MediaType.APPLICATION_JSON).body(body);
    }
}
