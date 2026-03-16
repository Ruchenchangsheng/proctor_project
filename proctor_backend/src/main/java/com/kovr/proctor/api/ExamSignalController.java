package com.kovr.proctor.api;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Controller;

import java.util.Map;

@Controller
@RequiredArgsConstructor
@Slf4j
public class ExamSignalController {
    private final SimpMessagingTemplate messagingTemplate;

    @MessageMapping("/exam-room.signal")
    public void signal(Map<String, Object> payload) {
        Object roomId = payload.get("roomId");
        if (roomId == null) {
            return;
        }
        log.info("exam-room signal relay: roomId={}, type={}, senderRole={}, senderId={}, targetId={}",
                roomId,
                payload.get("type"),
                payload.get("senderRole"),
                payload.get("senderId"),
                payload.get("targetId"));
        messagingTemplate.convertAndSend("/topic/exam-room." + roomId, payload);
    }
}
