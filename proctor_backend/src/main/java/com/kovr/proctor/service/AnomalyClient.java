package com.kovr.proctor.service;

import com.kovr.proctor.common.BusinessException;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.web.client.RestTemplate;

import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

@Service
@RequiredArgsConstructor
public class AnomalyClient {
    private final RestTemplate rt = new RestTemplate();

    @Value("${anomaly.base:http://localhost:8000}")
    String base;

    @SuppressWarnings("unchecked")
    public List<Map<String, Object>> detect(Long roomId, Long studentId, byte[] bytes, String mime, long tsMs) {
        if (base == null || base.isBlank()) return List.of();
        try {
            var body = new LinkedMultiValueMap<String, Object>();
            body.add("file", new ByteArrayResource(bytes) {
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
            if (resp == null || !(resp.get("ok") instanceof Boolean ok) || !ok) {
                return List.of();
            }
            Object events = resp.getOrDefault("events", Collections.emptyList());
            if (events instanceof List<?> list) {
                return (List<Map<String, Object>>) (List<?>) list;
            }
            return List.of();
        } catch (Exception ex) {
            return List.of();
        }
    }
}
