package com.kovr.proctor.service;

import org.springframework.stereotype.Service;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.Reader;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;
/**
 * BulkImportSupportService 封装批量导入教师、学生等基础数据时的辅助逻辑。
 */

@Service
public class BulkImportSupportService {
    public List<Map<String, String>> parseCsv(byte[] bytes) throws IOException {
        List<Map<String, String>> rows = new ArrayList<>();
        try (Reader reader = new InputStreamReader(new ByteArrayInputStream(bytes), StandardCharsets.UTF_8)) {
            List<String> lines = new ArrayList<>();
            StringBuilder current = new StringBuilder();
            int ch;
            while ((ch = reader.read()) != -1) {
                if (ch == '\r') {
                    continue;
                }
                if (ch == '\n') {
                    lines.add(current.toString());
                    current.setLength(0);
                    continue;
                }
                current.append((char) ch);
            }
            if (!current.isEmpty()) {
                lines.add(current.toString());
            }
            if (lines.isEmpty()) {
                return rows;
            }
            List<String> headers = parseCsvLine(stripBom(lines.get(0)));
            for (int i = 1; i < lines.size(); i++) {
                String line = lines.get(i);
                if (line == null || line.isBlank()) {
                    continue;
                }
                List<String> values = parseCsvLine(line);
                Map<String, String> row = new LinkedHashMap<>();
                for (int idx = 0; idx < headers.size(); idx++) {
                    row.put(normalizeHeader(headers.get(idx)), idx < values.size() ? normalize(values.get(idx)) : null);
                }
                row.put("_rowNum", String.valueOf(i + 1));
                rows.add(row);
            }
            return rows;
        }
    }

    public ZipBundle parseZip(byte[] bytes) throws IOException {
        Map<String, byte[]> entries = new LinkedHashMap<>();
        try (ZipInputStream zip = new ZipInputStream(new ByteArrayInputStream(bytes), StandardCharsets.UTF_8)) {
            ZipEntry entry;
            while ((entry = zip.getNextEntry()) != null) {
                if (entry.isDirectory()) {
                    continue;
                }
                entries.put(normalizeEntryName(entry.getName()), zip.readAllBytes());
            }
        }
        return new ZipBundle(entries);
    }

    private List<String> parseCsvLine(String line) {
        List<String> out = new ArrayList<>();
        StringBuilder current = new StringBuilder();
        boolean inQuotes = false;
        for (int i = 0; i < line.length(); i++) {
            char ch = line.charAt(i);
            if (ch == '"') {
                if (inQuotes && i + 1 < line.length() && line.charAt(i + 1) == '"') {
                    current.append('"');
                    i++;
                } else {
                    inQuotes = !inQuotes;
                }
            } else if (ch == ',' && !inQuotes) {
                out.add(normalize(current.toString()));
                current.setLength(0);
            } else {
                current.append(ch);
            }
        }
        out.add(normalize(current.toString()));
        return out;
    }

    private String stripBom(String value) {
        return value == null ? null : value.replace("\uFEFF", "");
    }

    private String normalizeHeader(String value) {
        return normalize(stripBom(value)).replace(" ", "");
    }

    private String normalize(String value) {
        if (value == null) {
            return null;
        }
        String text = value.trim();
        return text.isEmpty() ? null : text;
    }

    private String normalizeEntryName(String entryName) {
        return entryName == null ? "" : entryName.replace("\\", "/");
    }

    public record ZipBundle(Map<String, byte[]> entries) {
        public byte[] get(String name) {
            return entries.get(name == null ? "" : name.replace("\\", "/"));
        }
    }
}
