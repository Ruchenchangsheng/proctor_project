package com.kovr.proctor.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.messaging.simp.config.MessageBrokerRegistry;
import org.springframework.util.StringUtils;
import org.springframework.web.socket.config.annotation.*;
/**
 * WebSocketConfig 配置 STOMP 端点和消息代理，使实时监考通信可以在前后端之间流转。
 */

@Configuration
@EnableWebSocketMessageBroker
public class WebSocketConfig implements WebSocketMessageBrokerConfigurer {

    @Value("${app.cors.allowed-origins:http://localhost:*,http://127.0.0.1:*}")
    private String allowedOriginsCsv;

    @Override
    public void registerStompEndpoints(StompEndpointRegistry registry) {
        String[] origins = StringUtils.commaDelimitedListToStringArray(allowedOriginsCsv);
        // Spring 6 推荐使用 allowedOriginPatterns；SockJS 需要显式允许来源
        registry.addEndpoint("/ws")
                .addInterceptors(new WebSocketHandshakeLoggingInterceptor())
                .setAllowedOriginPatterns(origins)  // 或 setAllowedOrigins(origins)
                .withSockJS()
                .setSessionCookieNeeded(false);
    }

    @Override
    public void configureMessageBroker(MessageBrokerRegistry registry) {
        registry.enableSimpleBroker("/topic", "/queue");
        registry.setApplicationDestinationPrefixes("/app");
    }
}
