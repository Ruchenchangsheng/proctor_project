package com.kovr.proctor.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.messaging.simp.config.MessageBrokerRegistry;
import org.springframework.util.StringUtils;
import org.springframework.web.socket.config.annotation.*;

@Configuration
@EnableWebSocketMessageBroker
public class WebSocketConfig implements WebSocketMessageBrokerConfigurer {

    @Value("${app.cors.allowed-origins:http://localhost:5173}")
    private String allowedOriginsCsv;

    @Override
    public void registerStompEndpoints(StompEndpointRegistry registry) {
        String[] origins = StringUtils.commaDelimitedListToStringArray(allowedOriginsCsv);
        // Spring 6 推荐使用 allowedOriginPatterns；SockJS 需要显式允许来源
        registry.addEndpoint("/ws")
                .setAllowedOriginPatterns(origins)  // 或 setAllowedOrigins(origins)
                .withSockJS();
    }

    @Override
    public void configureMessageBroker(MessageBrokerRegistry registry) {
        registry.enableSimpleBroker("/topic", "/queue");
        registry.setApplicationDestinationPrefixes("/app");
    }
}
