package com.kovr.proctor;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableScheduling
public class ProctorApplication {
    public static void main(String[] args) {
        SpringApplication.run(ProctorApplication.class, args);
    }
}
