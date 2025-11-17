package com.kovr.proctor.api;


import com.kovr.proctor.service.FaceClient;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.Map;

@RestController
@RequestMapping("/api/_debug")
@RequiredArgsConstructor
public class DebugController {
    private final FaceClient faceClient;

    @Value("${face.base:}")
    private String faceBase;

    /** 联通性自检：中文输出 */
    @GetMapping("/face")
    public Map<String, Object> faceHealth() {
        Map<String, Object> res = new LinkedHashMap<>();
        try {
            var info = faceClient.extract("image/jpeg", new byte[]{1, 2, 3}); // 用任意字节测试
            boolean degraded = (faceBase == null || faceBase.isBlank())
                    || info.getDim() == 0
                    || "[]".equals(info.getJson());

            res.put("成功", true);
            res.put("服务地址", (faceBase == null || faceBase.isBlank()) ? "未配置（降级模式）" : faceBase);
            res.put("消息", degraded ? "已连接，但处于降级模式（未配置或无法访问人脸服务）" : "人脸服务连通正常");

            Map<String, Object> data = new LinkedHashMap<>();
            data.put("MIME", info.getMime());
            data.put("哈希SHA256", info.getSha256());
            data.put("特征维度", info.getDim());
            data.put("检测置信度", info.getScore());
            String json = info.getJson();
            data.put("特征是否为空", json == null || "[]".equals(json));
            if (json != null) {
                data.put("特征JSON片段", json.substring(0, Math.min(80, json.length())) + (json.length() > 80 ? "..." : ""));
            }
            res.put("数据", data);
            return res;
        } catch (Exception e) {
            res.put("成功", false);
            res.put("消息", "无法连接人脸服务");
            res.put("错误信息", e.getMessage());
            return res;
        }
    }
}

