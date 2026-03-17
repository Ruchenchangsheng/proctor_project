package com.kovr.proctor.service;

import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
/**
 * ExamLiveStateService 负责维护考场实时状态，例如在线学生、教师连接和考试是否结束。
 */

@Service
public class ExamLiveStateService {
    private final ConcurrentHashMap<String, LiveFrame> frames = new ConcurrentHashMap<>();

    public void putFrame(Long examRoomId, Long studentId, String mime, byte[] bytes) {
        String key = buildKey(examRoomId, studentId);
        // 实时监看只需要每个学生的最新一帧，所以这里直接覆盖旧值而不是长期累积。
        frames.put(key, new LiveFrame(examRoomId, studentId, mime, bytes, LocalDateTime.now()));
    }

    public LiveFrame getFrame(Long examRoomId, Long studentId) {
        return frames.get(buildKey(examRoomId, studentId));
    }

    public List<LiveFrame> listFrames(Long examRoomId) {
        List<LiveFrame> list = new ArrayList<>();
        for (Map.Entry<String, LiveFrame> e : frames.entrySet()) {
            if (e.getValue().examRoomId().equals(examRoomId)) {
                list.add(e.getValue());
            }
        }
        return list;
    }

    private String buildKey(Long roomId, Long studentId) {
        return roomId + ":" + studentId;
    }

    public record LiveFrame(Long examRoomId, Long studentId, String mime, byte[] imageBytes, LocalDateTime updatedAt) {
    }
}
