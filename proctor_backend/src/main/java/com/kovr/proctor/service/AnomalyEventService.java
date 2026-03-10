package com.kovr.proctor.service;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class AnomalyEventService {
    private final ConcurrentHashMap<String, EventState> activeStates = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<Long, List<Map<String, Object>>> roomEvents = new ConcurrentHashMap<>();

    @Value("${anomaly.min-duration-ms:2000}")
    long minDurationMs;

    public void mergeEvents(Long roomId, Long studentId, List<Map<String, Object>> events, double severeThreshold) {
        if (events == null || events.isEmpty()) return;
        List<Map<String, Object>> list = roomEvents.computeIfAbsent(roomId, k -> new ArrayList<>());
        synchronized (list) {
            for (Map<String, Object> e : events) {
                String type = String.valueOf(e.getOrDefault("type", ""));
                String label = String.valueOf(e.getOrDefault("label", "unknown"));
                long ts = toLong(e.get("ts_ms"), System.currentTimeMillis());
                double probability = toDouble(e.get("score"), 0.0d);
                String severity = probability >= severeThreshold ? "SEVERE" : "WARNING";
                String key = roomId + ":" + studentId + ":" + label;
                if ("enter".equals(type)) {
                    activeStates.put(key, new EventState(ts, severity, probability));
                } else if ("exit".equals(type)) {
                    EventState st = activeStates.remove(key);
                    long start = st == null ? ts : st.enterTs();
                    long dur = Math.max(0, ts - start);
                    if (dur >= minDurationMs) {
                        String exitSeverity = st == null ? severity : st.severity();
                        double exitProbability = st == null ? probability : st.probability();
                        list.add(make(roomId, studentId, label, "exit", start, ts, dur, exitSeverity, exitProbability));
                    }
                } else {
                    list.add(make(roomId, studentId, label, type, ts, ts, 0, severity, probability));
                }
            }
            if (list.size() > 200) {
                list.subList(0, list.size() - 200).clear();
            }
        }
    }

    public List<Map<String, Object>> listRoomEvents(Long roomId) {
        List<Map<String, Object>> list = roomEvents.getOrDefault(roomId, List.<Map<String, Object>>of());
        List<Map<String, Object>> copy;
        synchronized (list) {
            copy = new ArrayList<>(list);
        }
        copy.sort(Comparator.comparingLong((Map<String, Object> m) -> toLong(m.get("exitTs"), 0L)).reversed());
        return copy;
    }

    public List<Map<String, Object>> listActiveStates(Long roomId) {
        List<Map<String, Object>> out = new ArrayList<>();
        activeStates.forEach((k, v) -> {
            if (!k.startsWith(roomId + ":")) return;
            String[] arr = k.split(":", 3);
            if (arr.length < 3) return;
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("studentId", Long.parseLong(arr[1]));
            m.put("label", arr[2]);
            m.put("severity", v.severity());
            m.put("probability", v.probability());
            m.put("enterTs", v.enterTs());
            m.put("durationMs", System.currentTimeMillis() - v.enterTs());
            out.add(m);
        });
        out.sort(Comparator.comparingLong((Map<String, Object> m) -> toLong(m.get("durationMs"), 0L)).reversed());
        return out;
    }

    private Map<String, Object> make(Long roomId, Long studentId, String label, String type, long start, long end, long dur, String severity, double probability) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("roomId", roomId);
        m.put("studentId", studentId);
        m.put("label", label);
        m.put("type", type);
        m.put("enterTs", start);
        m.put("exitTs", end);
        m.put("durationMs", dur);
        m.put("exitAt", Instant.ofEpochMilli(end).toString());
        return m;
    }

    private long toLong(Object v, long def) {
        if (v instanceof Number n) return n.longValue();
        try { return Long.parseLong(String.valueOf(v)); } catch (Exception ignore) { return def; }
    }

    private double toDouble(Object v, double def) {
        if (v instanceof Number n) return n.doubleValue();
        try { return Double.parseDouble(String.valueOf(v)); } catch (Exception ignore) { return def; }
    }

    private record EventState(long enterTs, String severity, double probability) {}
}