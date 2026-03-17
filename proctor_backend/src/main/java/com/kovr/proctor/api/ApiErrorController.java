package com.kovr.proctor.api;

import jakarta.servlet.RequestDispatcher;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.boot.web.servlet.error.ErrorController;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
/**
 * ApiErrorController 统一输出接口错误响应，避免默认错误页泄漏实现细节。
 */

@RestController
public class ApiErrorController implements ErrorController {
    /**
     * 封装当前类中的一段独立业务步骤，减少调用方直接处理过多细节。
     * 阅读这个方法时，可以重点关注它读取了哪些输入、修改了哪些状态，以及异常或边界条件如何处理。
     */
    @RequestMapping("/error")
    public ResponseEntity<String> error(HttpServletRequest request) {
        HttpStatus status = resolveStatus(request);
        String message = readAttr(request, RequestDispatcher.ERROR_MESSAGE, "请求处理失败");
        Object ex = request.getAttribute(RequestDispatcher.ERROR_EXCEPTION);
        String errorType = ex == null ? status.getReasonPhrase() : ex.getClass().getSimpleName();

        String body = String.format(
                "{\"success\":false,\"errorType\":\"%s\",\"message\":\"%s\",\"path\":\"%s\"}",
                safe(errorType),
                safe(message),
                safe(request.getRequestURI()));
        return ResponseEntity.status(status).contentType(MediaType.APPLICATION_JSON).body(body);
    }

    /**
     * 封装当前类中的一段独立业务步骤，减少调用方直接处理过多细节。
     * 阅读这个方法时，可以重点关注它读取了哪些输入、修改了哪些状态，以及异常或边界条件如何处理。
     */
    private HttpStatus resolveStatus(HttpServletRequest request) {
        Object value = request.getAttribute(RequestDispatcher.ERROR_STATUS_CODE);
        if (value instanceof Integer code) {
            return HttpStatus.resolve(code) == null ? HttpStatus.INTERNAL_SERVER_ERROR : HttpStatus.valueOf(code);
        }
        if (value instanceof String text) {
            try {
                int code = Integer.parseInt(text);
                return HttpStatus.resolve(code) == null ? HttpStatus.INTERNAL_SERVER_ERROR : HttpStatus.valueOf(code);
            } catch (NumberFormatException ignore) {
                return HttpStatus.INTERNAL_SERVER_ERROR;
            }
        }
        return HttpStatus.INTERNAL_SERVER_ERROR;
    }

    private String readAttr(HttpServletRequest request, String name, String fallback) {
        Object value = request.getAttribute(name);
        if (value == null) {
            return fallback;
        }
        String text = String.valueOf(value).trim();
        return text.isEmpty() ? fallback : text;
    }

    private String safe(String value) {
        if (value == null) {
            return "";
        }
        return value.replace("\\", "\\\\").replace("\"", "\\\"");
    }
}
