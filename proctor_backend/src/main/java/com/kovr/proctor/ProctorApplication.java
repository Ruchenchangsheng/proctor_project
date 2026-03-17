package com.kovr.proctor;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;
/**
 * ProctorApplication 是后端启动入口，负责拉起 Spring Boot 容器并加载整套监考系统配置。
 */

@SpringBootApplication
@EnableScheduling
public class ProctorApplication {
    public static void main(String[] args) {
        SpringApplication.run(ProctorApplication.class, args);
    }
}
