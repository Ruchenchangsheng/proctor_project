package com.kovr.proctor.api;

import lombok.RequiredArgsConstructor;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Controller;

import java.util.Map;

@Controller
@RequiredArgsConstructor
public class ExamSignalController {
    private final SimpMessagingTemplate messagingTemplate;

    @MessageMapping("/exam-room.signal")
    public void signal(Map<String, Object> payload) {
        Object roomId = payload.get("roomId");
        if (roomId == null) {
            return;
        }
        messagingTemplate.convertAndSend("/topic/exam-room." + roomId, payload);
    }
}
