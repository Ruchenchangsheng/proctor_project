package com.kovr.proctor.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.kovr.proctor.domain.entity.AnomalyEvidenceEntity;
import com.kovr.proctor.domain.entity.RecordingSegmentEntity;
import com.kovr.proctor.infra.mapper.AnomalyEvidenceMapper;
import com.kovr.proctor.infra.mapper.RecordingSegmentMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
/**
 * StorageGovernanceService 负责监考证据和运行文件的目录治理与生命周期管理。
 */

@Service
@RequiredArgsConstructor
@Slf4j
public class StorageGovernanceService {
    private final PlatformSettingService platformSettingService;
    private final AnomalyEvidenceMapper anomalyEvidenceMapper;
    private final RecordingSegmentMapper recordingSegmentMapper;
    private final AuditLogService auditLogService;

    /**
     * 读取或查询当前业务场景下需要的数据。
     * 阅读这个方法时，可以重点关注它读取了哪些输入、修改了哪些状态，以及异常或边界条件如何处理。
     */
    public Map<String, Object> getStorageOverview() {
        Path baseDir = Paths.get(platformSettingService.getString("storage", "evidenceDir", "./data/anomaly-evidence")).toAbsolutePath().normalize();
        long totalBytes = safeDirectoryBytes(baseDir);
        long warningThresholdGb = platformSettingService.getLong("storage", "warningThresholdGb", 20);
        long warningThresholdBytes = warningThresholdGb * 1024L * 1024L * 1024L;
        int evidenceRetentionDays = platformSettingService.getInt("storage", "evidenceRetentionDays", 180);
        int recordingRetentionDays = platformSettingService.getInt("storage", "recordingRetentionDays", 30);

        Map<String, Object> storage = new LinkedHashMap<>();
        storage.put("evidenceDir", baseDir.toString());
        storage.put("evidenceRetentionDays", evidenceRetentionDays);
        storage.put("recordingRetentionDays", recordingRetentionDays);
        storage.put("cleanupEnabled", platformSettingService.getBoolean("storage", "cleanupEnabled", true));
        storage.put("cleanupMode", platformSettingService.getString("storage", "cleanupMode", "DELETE_EXPIRED"));
        storage.put("warningThresholdGb", warningThresholdGb);
        storage.put("totalBytes", totalBytes);
        storage.put("totalGb", formatGb(totalBytes));
        storage.put("warningTriggered", totalBytes >= warningThresholdBytes);
        storage.put("expiredEvidenceCount", countExpiredEvidences(evidenceRetentionDays));
        storage.put("expiredRecordingCount", countExpiredRecordings(recordingRetentionDays));
        return storage;
    }

    /**
     * 封装当前类中的一段独立业务步骤，减少调用方直接处理过多细节。
     * 阅读这个方法时，可以重点关注它读取了哪些输入、修改了哪些状态，以及异常或边界条件如何处理。
     */
    public Map<String, Object> cleanupExpired() {
        int evidenceRetentionDays = platformSettingService.getInt("storage", "evidenceRetentionDays", 180);
        int recordingRetentionDays = platformSettingService.getInt("storage", "recordingRetentionDays", 30);
        LocalDateTime evidenceBefore = LocalDateTime.now().minusDays(Math.max(1, evidenceRetentionDays));
        LocalDateTime recordingBefore = LocalDateTime.now().minusDays(Math.max(1, recordingRetentionDays));

        List<AnomalyEvidenceEntity> evidences = anomalyEvidenceMapper.selectList(new LambdaQueryWrapper<AnomalyEvidenceEntity>()
                .lt(AnomalyEvidenceEntity::getCreatedAt, evidenceBefore));
        List<RecordingSegmentEntity> segments = recordingSegmentMapper.selectList(new LambdaQueryWrapper<RecordingSegmentEntity>()
                .lt(RecordingSegmentEntity::getCreatedAt, recordingBefore));

        int deletedEvidence = 0;
        for (AnomalyEvidenceEntity entity : evidences) {
            deleteFile(entity.getFilePath());
            anomalyEvidenceMapper.deleteById(entity.getId());
            deletedEvidence++;
        }

        int deletedSegments = 0;
        for (RecordingSegmentEntity entity : segments) {
            deleteFile(entity.getFilePath());
            recordingSegmentMapper.deleteById(entity.getId());
            deletedSegments++;
        }

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("deletedEvidence", deletedEvidence);
        result.put("deletedSegments", deletedSegments);
        auditLogService.logCurrent("STORAGE_CLEANUP", "STORAGE", "expired", "执行过期存储清理", "证据：" + deletedEvidence + " ｜ 切片：" + deletedSegments);
        return result;
    }

    /**
     * 封装当前类中的一段独立业务步骤，减少调用方直接处理过多细节。
     * 阅读这个方法时，可以重点关注它读取了哪些输入、修改了哪些状态，以及异常或边界条件如何处理。
     */
    @Scheduled(cron = "0 30 3 * * *")
    public void cleanupExpiredScheduled() {
        if (!platformSettingService.getBoolean("storage", "cleanupEnabled", true)) {
            return;
        }
        try {
            cleanupExpired();
        } catch (Exception ex) {
            log.warn("Scheduled storage cleanup failed: {}", ex.toString());
        }
    }

    /**
     * 封装当前类中的一段独立业务步骤，减少调用方直接处理过多细节。
     * 阅读这个方法时，可以重点关注它读取了哪些输入、修改了哪些状态，以及异常或边界条件如何处理。
     */
    private int countExpiredEvidences(int retentionDays) {
        return Math.toIntExact(anomalyEvidenceMapper.selectCount(new LambdaQueryWrapper<AnomalyEvidenceEntity>()
                .lt(AnomalyEvidenceEntity::getCreatedAt, LocalDateTime.now().minusDays(Math.max(1, retentionDays)))));
    }

    /**
     * 封装当前类中的一段独立业务步骤，减少调用方直接处理过多细节。
     * 阅读这个方法时，可以重点关注它读取了哪些输入、修改了哪些状态，以及异常或边界条件如何处理。
     */
    private int countExpiredRecordings(int retentionDays) {
        return Math.toIntExact(recordingSegmentMapper.selectCount(new LambdaQueryWrapper<RecordingSegmentEntity>()
                .lt(RecordingSegmentEntity::getCreatedAt, LocalDateTime.now().minusDays(Math.max(1, retentionDays)))));
    }

    /**
     * 封装当前类中的一段独立业务步骤，减少调用方直接处理过多细节。
     * 阅读这个方法时，可以重点关注它读取了哪些输入、修改了哪些状态，以及异常或边界条件如何处理。
     */
    private long safeDirectoryBytes(Path path) {
        if (path == null || !Files.exists(path)) {
            return 0L;
        }
        try (var stream = Files.walk(path)) {
            return stream.filter(Files::isRegularFile).mapToLong(item -> {
                try {
                    return Files.size(item);
                } catch (IOException e) {
                    return 0L;
                }
            }).sum();
        } catch (IOException ex) {
            return 0L;
        }
    }

    /**
     * 执行删除、重置或状态切换操作，并处理随后的收尾动作。
     * 阅读这个方法时，可以重点关注它读取了哪些输入、修改了哪些状态，以及异常或边界条件如何处理。
     */
    private void deleteFile(String filePath) {
        if (filePath == null || filePath.isBlank()) {
            return;
        }
        try {
            Files.deleteIfExists(Paths.get(filePath));
        } catch (Exception ignore) {
        }
    }

    /**
     * 把输入值转换成当前模块更容易继续处理的标准格式。
     * 阅读这个方法时，可以重点关注它读取了哪些输入、修改了哪些状态，以及异常或边界条件如何处理。
     */
    private double formatGb(long bytes) {
        return Math.round((bytes / 1024d / 1024d / 1024d) * 100d) / 100d;
    }
}
