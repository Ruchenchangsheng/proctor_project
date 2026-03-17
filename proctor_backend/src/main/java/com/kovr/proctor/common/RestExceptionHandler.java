package com.kovr.proctor.common;

import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.AuthenticationException;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.util.Map;
import java.util.stream.Collectors;
/**
 * RestExceptionHandler 封装接口层和业务层都会复用的通用错误或基础能力。
 */

@RestControllerAdvice
public class RestExceptionHandler {
    /**
     * 封装当前类中的一段独立业务步骤，减少调用方直接处理过多细节。
     * 阅读这个方法时，可以重点关注它读取了哪些输入、修改了哪些状态，以及异常或边界条件如何处理。
     */
    private String safe(String value) {
        if (value == null) {
            return "";
        }
        return value.replace("\\", "\\\\").replace("\"", "\\\"");
    }

    /**
     * 封装当前类中的一段独立业务步骤，减少调用方直接处理过多细节。
     * 阅读这个方法时，可以重点关注它读取了哪些输入、修改了哪些状态，以及异常或边界条件如何处理。
     */
    private ResponseEntity<String> json(HttpStatus status, String error, String message, String code, String detailsJson) {
        String detailsPart = detailsJson == null ? "null" : detailsJson;
        String body = String.format(
                "{\"error\":\"%s\",\"message\":\"%s\",\"code\":\"%s\",\"details\":%s}",
                safe(error),
                safe(message),
                safe(code),
                detailsPart);
        return ResponseEntity.status(status).contentType(MediaType.APPLICATION_JSON).body(body);
    }

    /**
     * 封装当前类中的一段独立业务步骤，减少调用方直接处理过多细节。
     * 阅读这个方法时，可以重点关注它读取了哪些输入、修改了哪些状态，以及异常或边界条件如何处理。
     */
    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<String> onValidation(MethodArgumentNotValidException e) {
        Map<String, String> m = e.getBindingResult().getFieldErrors().stream()
                .collect(Collectors.toMap(FieldError::getField, FieldError::getDefaultMessage, (a, b) -> a));
        String details = m.entrySet().stream()
                .map(entry -> String.format("\"%s\":\"%s\"", safe(entry.getKey()), safe(entry.getValue())))
                .collect(Collectors.joining(",", "{", "}"));
        return json(HttpStatus.BAD_REQUEST, "BadRequest", "参数校验失败", "VALIDATION_ERROR", details);
    }

    @ExceptionHandler(AuthenticationException.class)
    public ResponseEntity<String> onAuth(AuthenticationException e) {
        return json(HttpStatus.UNAUTHORIZED, "Unauthorized", e.getMessage(), "UNAUTHORIZED", null);
    }

    @ExceptionHandler(AccessDeniedException.class)
    public ResponseEntity<String> onDeny(AccessDeniedException e) {
        return json(HttpStatus.FORBIDDEN, "Forbidden", "无权限访问", "FORBIDDEN", null);
    }
}
