package com.kovr.proctor.domain.event;

public record AccountCreatedEvent(String to, String name, String domain, String rawPwd) {}
