package com.kovr.proctor.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.web.client.RestTemplate;

import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
/**
 * AnomalyClient 负责把监考帧发送给异常检测服务，并接收模型输出的异常结果。
 */

@Service
@RequiredArgsConstructor
@Slf4j
public class AnomalyClient {
    private final RestTemplate rt = new RestTemplate();
    private final ConcurrentHashMap<String, Long> lastEmptyResultLogAt = new ConcurrentHashMap<>();

    @Value("${anomaly.base:http://localhost:8000}")
    String base;

    @Value("${anomaly.log-results:true}")
    boolean logResults;

    @Value("${anomaly.log-empty-interval-ms:3000}")
    long logEmptyIntervalMs;

    /**
     * 封装当前类中的一段独立业务步骤，减少调用方直接处理过多细节。
     * 阅读这个方法时，可以重点关注它读取了哪些输入、修改了哪些状态，以及异常或边界条件如何处理。
     */
    @SuppressWarnings("unchecked")
    public List<Map<String, Object>> detect(Long roomId, Long studentId, byte[] bytes, String mime, long tsMs) {
        if (base == null || base.isBlank()) return List.of();
        try {
            // Python 服务需要房间、学生和时间戳一起上送，才能维持每个学生独立的在线状态机。
            var body = new LinkedMultiValueMap<String, Object>();
            body.add("file", new ByteArrayResource(bytes) {
                /**
                 * 读取或查询当前业务场景下需要的数据。
                 * 阅读这个方法时，可以重点关注它读取了哪些输入、修改了哪些状态，以及异常或边界条件如何处理。
                 */
                @Override
                public String getFilename() { return "frame.jpg"; }
            });
            body.add("room_id", String.valueOf(roomId));
            body.add("student_id", String.valueOf(studentId));
            body.add("ts_ms", String.valueOf(tsMs));

            HttpHeaders h = new HttpHeaders();
            h.setContentType(MediaType.MULTIPART_FORM_DATA);
            h.setAccept(List.of(MediaType.APPLICATION_JSON));
            if (mime != null && !mime.isBlank()) {
                h.set("X-Frame-Mime", mime);
            }

            Map<String, Object> resp = rt.postForObject(base + "/anomaly/frame", new HttpEntity<>(body, h), Map.class);
            if (resp == null) {
                if (logResults) {
                    log.warn("anomaly/frame response is null: roomId={}, studentId={}, tsMs={}", roomId, studentId, tsMs);
                }
                return List.of();
            }

            Object okRaw = resp.get("ok");
            boolean ok = okRaw instanceof Boolean b && b;
            if (!ok) {
                if (logResults) {
                    log.warn(
                            "anomaly/frame response not ok: roomId={}, studentId={}, tsMs={}, resp={}",
                            roomId, studentId, tsMs, summarizeResponse(resp)
                    );
                }
                return List.of();
            }

            Object events = resp.getOrDefault("events", Collections.emptyList());
            if (events instanceof List<?> list) {
                List<Map<String, Object>> parsedEvents = (List<Map<String, Object>>) (List<?>) list;
                logDetectionResult(roomId, studentId, tsMs, resp, parsedEvents);
                return parsedEvents;
            }
            logDetectionResult(roomId, studentId, tsMs, resp, List.of());
            return List.of();
        } catch (Exception ex) {
            if (logResults) {
                log.warn(
                        "anomaly/frame request failed: roomId={}, studentId={}, tsMs={}, err={}",
                        roomId, studentId, tsMs, ex.getMessage(), ex
                );
            }
            return List.of();
        }
    }

    /**
     * 封装当前类中的一段独立业务步骤，减少调用方直接处理过多细节。
     * 阅读这个方法时，可以重点关注它读取了哪些输入、修改了哪些状态，以及异常或边界条件如何处理。
     */
    private void logDetectionResult(
            Long roomId,
            Long studentId,
            long tsMs,
            Map<String, Object> resp,
            List<Map<String, Object>> events
    ) {
        if (!logResults) {
            return;
        }

        int eventCount = events.size();
        if (eventCount > 0) {
            log.info(
                    "anomaly/frame result: roomId={}, studentId={}, tsMs={}, resp={}",
                    roomId, studentId, tsMs, summarizeResponse(resp)
            );
            return;
        }

        String key = roomId + ":" + studentId;
        long now = System.currentTimeMillis();
        Long lastAt = lastEmptyResultLogAt.get(key);
        // 没有异常是常态，这里限流日志，避免把正常监考流刷满日志文件。
        if (lastAt != null && now - lastAt < logEmptyIntervalMs) {
            return;
        }
        lastEmptyResultLogAt.put(key, now);
        log.info(
                "anomaly/frame result: roomId={}, studentId={}, tsMs={}, resp={}",
                roomId, studentId, tsMs, summarizeResponse(resp)
        );
    }

    /**
     * 封装当前类中的一段独立业务步骤，减少调用方直接处理过多细节。
     * 阅读这个方法时，可以重点关注它读取了哪些输入、修改了哪些状态，以及异常或边界条件如何处理。
     */
    private Map<String, Object> summarizeResponse(Map<String, Object> resp) {
        return Map.of(
                "ok", resp.get("ok"),
                "backend", resp.get("backend"),
                "eventCount", extractEventCount(resp.get("events")),
                "events", resp.getOrDefault("events", List.of()),
                "labels", resp.getOrDefault("labels", List.of()),
                "fps", resp.get("fps"),
                "windowSec", resp.get("window_sec"),
                "stepSec", resp.get("step_sec")
        );
    }

    /**
     * 封装当前类中的一段独立业务步骤，减少调用方直接处理过多细节。
     * 阅读这个方法时，可以重点关注它读取了哪些输入、修改了哪些状态，以及异常或边界条件如何处理。
     */
    private int extractEventCount(Object events) {
        if (events instanceof List<?> list) {
            return list.size();
        }
        return 0;
    }
}
