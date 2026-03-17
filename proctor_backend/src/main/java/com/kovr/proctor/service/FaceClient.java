package com.kovr.proctor.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.kovr.proctor.common.BusinessException;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ContentDisposition;
import org.springframework.stereotype.Service;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClientResponseException;
import org.springframework.web.client.RestTemplate;

import java.security.MessageDigest;
import java.util.*;
/**
 * FaceClient 负责调用人脸识别服务，提取特征向量并执行远端核验。
 */

@Service
@RequiredArgsConstructor
@Slf4j
public class FaceClient {

    private final RestTemplate rt = createRestTemplate();

    @Value("${face.base:}")
    String base;

    /**
     * 封装当前类中的一段独立业务步骤，减少调用方直接处理过多细节。
     * 阅读这个方法时，可以重点关注它读取了哪些输入、修改了哪些状态，以及异常或边界条件如何处理。
     */
    private static String sha256(byte[] b) throws Exception {
        var md = MessageDigest.getInstance("SHA-256");
        var d = md.digest(b);
        StringBuilder sb = new StringBuilder();
        for (byte x : d) sb.append(String.format("%02x", x));
        return sb.toString();
    }

    /**
     * 把输入值转换成当前模块更容易继续处理的标准格式。
     * 阅读这个方法时，可以重点关注它读取了哪些输入、修改了哪些状态，以及异常或边界条件如何处理。
     */
    private static double asDouble(Object o, double defVal) {
        if (o == null) return defVal;
        if (o instanceof Number n) return n.doubleValue();
        try {
            return Double.parseDouble(String.valueOf(o));
        } catch (Exception ignore) {
            return defVal;
        }
    }


    /**
     * 创建并组装当前业务对象或执行一段创建型流程。
     * 阅读这个方法时，可以重点关注它读取了哪些输入、修改了哪些状态，以及异常或边界条件如何处理。
     */
    private RestTemplate createRestTemplate() {
        SimpleClientHttpRequestFactory f = new SimpleClientHttpRequestFactory();
        f.setConnectTimeout(5000);
        f.setReadTimeout(10000);
        return new RestTemplate(f);
    }

    /**
     * 封装当前类中的一段独立业务步骤，减少调用方直接处理过多细节。
     * 阅读这个方法时，可以重点关注它读取了哪些输入、修改了哪些状态，以及异常或边界条件如何处理。
     */
    private MediaType safeMediaType(String mime) {
        try {
            return (mime == null || mime.isBlank()) ? MediaType.APPLICATION_OCTET_STREAM : MediaType.parseMediaType(mime);
        } catch (Exception ignore) {
            return MediaType.APPLICATION_OCTET_STREAM;
        }
    }

    /**
     * 封装当前类中的一段独立业务步骤，减少调用方直接处理过多细节。
     * 阅读这个方法时，可以重点关注它读取了哪些输入、修改了哪些状态，以及异常或边界条件如何处理。
     */
    @SuppressWarnings("unchecked")
    public FaceInfo extract(String mime, byte[] bytes) {
        try {
            // 未配置远端，降级：只算 sha，embedding 为空
            if (base == null || base.isBlank()) {
                String sha = sha256(bytes);
                return new FaceInfo(mime, sha, "[]", 0, 0.0, 0);
            }

            var fileRes = new ByteArrayResource(bytes) {
                /**
                 * 读取或查询当前业务场景下需要的数据。
                 * 阅读这个方法时，可以重点关注它读取了哪些输入、修改了哪些状态，以及异常或边界条件如何处理。
                 */
                @Override
                public String getFilename() { return "photo.jpg"; }
            };

            HttpHeaders partHeaders = new HttpHeaders();
            partHeaders.setContentType(safeMediaType(mime));
            partHeaders.setContentDisposition(ContentDisposition.formData().name("file").filename(fileRes.getFilename()).build());

            var body = new LinkedMultiValueMap<String, Object>();
            body.add("file", new HttpEntity<>(fileRes, partHeaders));

            HttpHeaders h = new HttpHeaders();
            h.setContentType(MediaType.MULTIPART_FORM_DATA);

            var resp = rt.postForEntity(base + "/embed", new HttpEntity<>(body, h), Map.class);
            Map<String, Object> m = resp.getBody();
            if (m == null) {
                throw new BusinessException("FACE_EXTRACT_FAILED", "人脸服务无响应内容");
            }
            if (!Boolean.TRUE.equals(m.get("ok")) && m.containsKey("msg")) {
                String msg = String.valueOf(m.get("msg"));
                throw new BusinessException("FACE_EXTRACT_FAILED", "人脸服务提取失败: " + msg);
            }

            // 这里把 Python 服务的返回做了一层兼容，避免字段名微调就影响主流程。
            // 兼容字段：
            // - det_score(优先) / det(兼容)
            // - dim(优先) / 根据 embedding 自动推断
            // - mime/sha256 如缺失用入参/本地计算兜底
            Object embObj = m.getOrDefault("embedding", Collections.emptyList());
            List<?> embedding = (embObj instanceof List) ? (List<?>) embObj : Collections.emptyList();
            int dim = (int) asDouble(m.get("dim"), embedding.size());
            double det = asDouble(m.getOrDefault("det_score", m.get("det")), 0.0);
            int faceCount = (int) asDouble(m.get("face_count"), 1.0);

            String outMime = String.valueOf(m.getOrDefault("mime", mime));
            String outSha = String.valueOf(m.getOrDefault("sha256", sha256(bytes)));

            // 把 embedding 序列化成 JSON 字符串
            String json = new ObjectMapper().writeValueAsString(embedding);

            return new FaceInfo(outMime, outSha, json, dim, det, faceCount);
        } catch (BusinessException be) {
            throw be;
        } catch (RestClientResponseException rce) {
            // 人脸服务返回了明确的 HTTP 错误，通常说明服务在线但请求内容不合法或内部处理失败。
            log.warn("调用人脸服务失败: status={}, body={}", rce.getStatusCode(), rce.getResponseBodyAsString());
            throw new BusinessException("FACE_SERVICE_UNAVAILABLE", "人脸服务调用失败");
        } catch (ResourceAccessException rae) {
            log.warn("调用人脸服务网络异常: base={}, bytes={}, err={}", base, bytes == null ? 0 : bytes.length, rae.getMessage());
            throw new BusinessException("FACE_SERVICE_UNAVAILABLE", "人脸服务暂不可用");
        } catch (Exception e) {
            log.warn("人脸特征提取异常: {}", e.getMessage());
            throw new BusinessException("FACE_EXTRACT_FAILED", "人脸特征提取失败");
        }
    }

    @Data
    @AllArgsConstructor
    public static class FaceInfo {
        private String mime;
        private String sha256;
        private String json;   // embedding json
        private int dim;
        private double score;  // det_score / det
        private int faceCount;
    }
}
