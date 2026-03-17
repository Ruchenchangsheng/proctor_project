package com.kovr.proctor.domain.event;
/**
 * AccountCreatedEvent 描述系统内部发布的领域事件，用于把业务动作解耦给监听器处理。
 */

public record AccountCreatedEvent(String to, String name, String domain, String rawPwd) {}
