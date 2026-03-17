package com.kovr.proctor.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.server.ServerHttpRequest;
import org.springframework.http.server.ServerHttpResponse;
import org.springframework.web.socket.WebSocketHandler;
import org.springframework.web.socket.server.HandshakeInterceptor;

import java.util.Map;
/**
 * WebSocketHandshakeLoggingInterceptor 在握手阶段记录关键信息，帮助定位实时连接失败原因。
 */

public class WebSocketHandshakeLoggingInterceptor implements HandshakeInterceptor {
    private static final Logger log = LoggerFactory.getLogger(WebSocketHandshakeLoggingInterceptor.class);
    /**
     * 封装当前类中的一段独立业务步骤，减少调用方直接处理过多细节。
     * 阅读这个方法时，可以重点关注它读取了哪些输入、修改了哪些状态，以及异常或边界条件如何处理。
     */
    /**
     * 封装当前类中的一段独立业务步骤，减少调用方直接处理过多细节。
     * 阅读这个方法时，可以重点关注它读取了哪些输入、修改了哪些状态，以及异常或边界条件如何处理。
     */

    @Override
    public boolean beforeHandshake(ServerHttpRequest request,
                                   ServerHttpResponse response,
                                   WebSocketHandler wsHandler,
                                   Map<String, Object> attributes) {
        log.info("ws handshake request: uri={}, origin={}", request.getURI(), request.getHeaders().getOrigin());
        return true;
    }

    @Override
    public void afterHandshake(ServerHttpRequest request,
                               ServerHttpResponse response,
                               WebSocketHandler wsHandler,
                               Exception exception) {
        if (exception == null) {
            log.info("ws handshake completed: uri={}", request.getURI());
        } else {
            log.warn("ws handshake failed: uri={}, err={}", request.getURI(), exception.toString());
        }
    }
}
