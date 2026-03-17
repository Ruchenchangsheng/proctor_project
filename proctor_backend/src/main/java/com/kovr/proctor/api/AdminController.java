package com.kovr.proctor.api;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.kovr.proctor.api.dto.CreateSchoolReq;
import com.kovr.proctor.api.dto.UpdateSchoolAdminReq;
import com.kovr.proctor.api.dto.UpdateSchoolReq;
import com.kovr.proctor.common.BusinessException;
import com.kovr.proctor.domain.entity.SchoolEntity;
import com.kovr.proctor.domain.entity.UserEntity;
import com.kovr.proctor.infra.mapper.ExamMapper;
import com.kovr.proctor.infra.mapper.SchoolAdminMapper;
import com.kovr.proctor.infra.mapper.SchoolMapper;
import com.kovr.proctor.infra.mapper.StudentMapper;
import com.kovr.proctor.infra.mapper.TeacherMapper;
import com.kovr.proctor.infra.mapper.UserMapper;
import com.kovr.proctor.service.AnomalyEvidenceService;
import com.kovr.proctor.service.AuditLogService;
import com.kovr.proctor.service.ExamArrangeService;
import com.kovr.proctor.service.MailService;
import com.kovr.proctor.service.NotificationTemplateService;
import com.kovr.proctor.service.PlatformSettingService;
import com.kovr.proctor.service.SchoolService;
import com.kovr.proctor.service.StorageGovernanceService;
import com.kovr.proctor.util.PasswordGen;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
/**
 * AdminController 负责平台管理员的学校、用户、考试和平台设置等全局接口。
 */

@RestController
@RequestMapping("/api/admin")
@RequiredArgsConstructor
public class AdminController {
    private final SchoolMapper schoolMapper;
    private final SchoolAdminMapper schoolAdminMapper;
    private final UserMapper userMapper;
    private final TeacherMapper teacherMapper;
    private final StudentMapper studentMapper;
    private final ExamMapper examMapper;
    private final SchoolService schoolService;
    private final PasswordGen passwordGen;
    private final PasswordEncoder passwordEncoder;
    private final MailService mailService;
    private final ExamArrangeService examArrangeService;
    private final AnomalyEvidenceService anomalyEvidenceService;
    private final AuditLogService auditLogService;
    private final PlatformSettingService platformSettingService;
    private final NotificationTemplateService notificationTemplateService;
    private final StorageGovernanceService storageGovernanceService;

    @Value("${server.port:8080}")
    private String serverPort;

    @Value("${face.base:http://localhost:8000}")
    private String faceBase;

    @Value("${anomaly.base:http://localhost:8000}")
    private String anomalyBase;

    @Value("${spring.mail.host:}")
    private String mailHost;

    @Value("${spring.mail.port:0}")
    private int mailPort;

    @Value("${spring.mail.username:}")
    private String mailUsername;

    @Value("${spring.mail.from:}")
    private String springMailFrom;

    @Value("${mail.from:}")
    private String legacyMailFrom;

    @Value("${app.mail.enabled:true}")
    private boolean mailEnabled;

    @Value("${app.cors.allowed-origins:}")
    private String corsOrigins;

    @Value("${app.face.verify.threshold:0.55}")
    private double faceVerifyThreshold;

    @Value("${app.face.min_det_score:0.55}")
    private double minFaceDetScore;

    @Value("${anomaly.min-duration-ms:2000}")
    private long anomalyMinDurationMs;

    @Value("${anomaly.max-reconnect-count:3}")
    private int maxReconnectCount;

    @Value("${anomaly.evidence.video-format:mp4}")
    private String evidenceVideoFormat;

    @Value("${anomaly.evidence.padding-before-ms:1000}")
    private long evidencePaddingBeforeMs;

    @Value("${anomaly.evidence.padding-after-ms:1000}")
    private long evidencePaddingAfterMs;

    /**
     * 读取或查询当前业务场景下需要的数据。
     * 阅读这个方法时，可以重点关注它读取了哪些输入、修改了哪些状态，以及异常或边界条件如何处理。
     */
    @GetMapping("/schools")
    @PreAuthorize("hasRole('ADMIN')")
    public List<Map<String, Object>> listSchools(
            @RequestParam(required = false) String keyword,
            @RequestParam(required = false) Integer enabled) {
        return schoolMapper.selectPlatformSchools(trimToNull(keyword), enabled);
    }

    /**
     * 创建并组装当前业务对象或执行一段创建型流程。
     * 阅读这个方法时，可以重点关注它读取了哪些输入、修改了哪些状态，以及异常或边界条件如何处理。
     */
    @PostMapping("/schools")
    @PreAuthorize("hasRole('ADMIN')")
    public Map<String, Object> create(@RequestBody CreateSchoolReq req) {
        Map<String, Object> result = schoolService.createSchoolAndAdmin(req.schoolName(), req.adminName(), req.adminEmail(), req.domain());
        auditLogService.logCurrent("SCHOOL_CREATE", "SCHOOL", String.valueOf(result.get("schoolId")), "创建学校", "学校：" + req.schoolName() + " ｜ 管理员：" + req.adminName());
        return result;
    }

    /**
     * 更新当前业务状态，并把变更写回数据库、内存或界面状态。
     * 阅读这个方法时，可以重点关注它读取了哪些输入、修改了哪些状态，以及异常或边界条件如何处理。
     */
    @PutMapping("/schools/{schoolId}")
    @PreAuthorize("hasRole('ADMIN')")
    @Transactional
    public Map<String, Object> updateSchool(
            @PathVariable Long schoolId,
            @RequestBody UpdateSchoolReq req) {
        SchoolEntity school = requireSchool(schoolId);
        Long adminUserId = schoolAdminMapper.selectAdminUserIdBySchoolId(schoolId);
        if (adminUserId == null) {
            throw new BusinessException("NOT_FOUND", "学校管理员账号不存在");
        }
        UserEntity admin = requireUser(adminUserId, "学校管理员账号不存在");

        String schoolName = requireText(req.schoolName(), "学校名称不能为空");
        String domain = requireText(req.domain(), "学校邮箱域不能为空");
        String adminName = requireText(req.adminName(), "学校管理员姓名不能为空");
        String adminEmail = requireText(req.adminEmail(), "学校管理员邮箱不能为空");

        ensureSchoolNameUnique(schoolName, schoolId);
        ensureEmailUnique(adminEmail, adminUserId);

        school.setName(schoolName);
        school.setDomain(domain);
        schoolMapper.updateById(school);

        admin.setName(adminName);
        admin.setEmail(adminEmail);
        userMapper.updateById(admin);
        auditLogService.logCurrent("SCHOOL_UPDATE", "SCHOOL", String.valueOf(schoolId), "修改学校信息", "学校：" + schoolName + " ｜ 管理员：" + adminName);
        return Map.of("ok", true);
    }

    /**
     * 执行删除、重置或状态切换操作，并处理随后的收尾动作。
     * 阅读这个方法时，可以重点关注它读取了哪些输入、修改了哪些状态，以及异常或边界条件如何处理。
     */
    @PostMapping("/schools/{schoolId}/toggle-enabled")
    @PreAuthorize("hasRole('ADMIN')")
    @Transactional
    public Map<String, Object> toggleSchoolEnabled(
            @PathVariable Long schoolId,
            @RequestBody Map<String, Object> req) {
        requireSchool(schoolId);
        boolean enabled = parseEnabled(req.get("enabled"));

        List<Long> userIds = new ArrayList<>();
        Long adminUserId = schoolAdminMapper.selectAdminUserIdBySchoolId(schoolId);
        if (adminUserId != null) {
            userIds.add(adminUserId);
        }
        userIds.addAll(teacherMapper.selectTeacherUserIdsBySchool(schoolId));
        userIds.addAll(studentMapper.selectStudentUserIdsBySchool(schoolId));

        if (!userIds.isEmpty()) {
            userMapper.update(null, new LambdaUpdateWrapper<UserEntity>()
                    .in(UserEntity::getId, userIds)
                    .set(UserEntity::getEnabled, enabled ? 1 : 0));
        }
        auditLogService.logCurrent(enabled ? "SCHOOL_ENABLE" : "SCHOOL_DISABLE", "SCHOOL", String.valueOf(schoolId), enabled ? "启用学校" : "停用学校", "影响账号数：" + userIds.size());

        return Map.of(
                "ok", true,
                "enabled", enabled,
                "affectedUsers", userIds.size());
    }

    /**
     * 读取或查询当前业务场景下需要的数据。
     * 阅读这个方法时，可以重点关注它读取了哪些输入、修改了哪些状态，以及异常或边界条件如何处理。
     */
    @GetMapping("/school-admins")
    @PreAuthorize("hasRole('ADMIN')")
    public List<Map<String, Object>> listSchoolAdmins(
            @RequestParam(required = false) Long schoolId,
            @RequestParam(required = false) String keyword,
            @RequestParam(required = false) Integer enabled) {
        return schoolAdminMapper.selectPlatformAdmins(schoolId, trimToNull(keyword), enabled);
    }

    /**
     * 更新当前业务状态，并把变更写回数据库、内存或界面状态。
     * 阅读这个方法时，可以重点关注它读取了哪些输入、修改了哪些状态，以及异常或边界条件如何处理。
     */
    @PutMapping("/school-admins/{userId}")
    @PreAuthorize("hasRole('ADMIN')")
    @Transactional
    public Map<String, Object> updateSchoolAdmin(
            @PathVariable Long userId,
            @RequestBody UpdateSchoolAdminReq req) {
        ensureSchoolAdmin(userId);
        UserEntity admin = requireUser(userId, "学校管理员账号不存在");
        String email = requireText(req.email(), "管理员邮箱不能为空");
        ensureEmailUnique(email, userId);
        admin.setName(requireText(req.name(), "管理员姓名不能为空"));
        admin.setEmail(email);
        userMapper.updateById(admin);
        auditLogService.logCurrent("SCHOOL_ADMIN_UPDATE", "SCHOOL_ADMIN", String.valueOf(userId), "修改学校管理员", "姓名：" + admin.getName() + " ｜ 邮箱：" + admin.getEmail());
        return Map.of("ok", true);
    }

    /**
     * 执行删除、重置或状态切换操作，并处理随后的收尾动作。
     * 阅读这个方法时，可以重点关注它读取了哪些输入、修改了哪些状态，以及异常或边界条件如何处理。
     */
    @PostMapping("/school-admins/{userId}/toggle-enabled")
    @PreAuthorize("hasRole('ADMIN')")
    public Map<String, Object> toggleSchoolAdminEnabled(
            @PathVariable Long userId,
            @RequestBody Map<String, Object> req) {
        ensureSchoolAdmin(userId);
        boolean enabled = parseEnabled(req.get("enabled"));
        userMapper.update(null, new LambdaUpdateWrapper<UserEntity>()
                .eq(UserEntity::getId, userId)
                .set(UserEntity::getEnabled, enabled ? 1 : 0));
        auditLogService.logCurrent(enabled ? "ACCOUNT_ENABLE" : "ACCOUNT_FREEZE", "SCHOOL_ADMIN", String.valueOf(userId), enabled ? "启用学校管理员账号" : "冻结学校管理员账号", "用户ID：" + userId);
        return Map.of("ok", true, "enabled", enabled);
    }

    /**
     * 执行删除、重置或状态切换操作，并处理随后的收尾动作。
     * 阅读这个方法时，可以重点关注它读取了哪些输入、修改了哪些状态，以及异常或边界条件如何处理。
     */
    @PostMapping("/school-admins/{userId}/reset-password")
    @PreAuthorize("hasRole('ADMIN')")
    public Map<String, Object> resetSchoolAdminPassword(@PathVariable Long userId) {
        ensureSchoolAdmin(userId);
        Map<String, Object> result = resetPasswordForUser(userId);
        auditLogService.logCurrent("PASSWORD_RESET", "SCHOOL_ADMIN", String.valueOf(userId), "重置学校管理员密码", "用户ID：" + userId);
        return result;
    }

    /**
     * 读取或查询当前业务场景下需要的数据。
     * 阅读这个方法时，可以重点关注它读取了哪些输入、修改了哪些状态，以及异常或边界条件如何处理。
     */
    @GetMapping("/exams")
    @PreAuthorize("hasRole('ADMIN')")
    public List<Map<String, Object>> listExams(
            @RequestParam(required = false) Long schoolId,
            @RequestParam(required = false) String keyword,
            @RequestParam(required = false) String status) {
        return examMapper.selectExamsForAdmin(schoolId, trimToNull(keyword), trimToNull(status));
    }

    /**
     * 读取或查询当前业务场景下需要的数据。
     * 阅读这个方法时，可以重点关注它读取了哪些输入、修改了哪些状态，以及异常或边界条件如何处理。
     */
    @GetMapping("/exams/{examId}/rooms")
    @PreAuthorize("hasRole('ADMIN')")
    public List<Map<String, Object>> listExamRooms(@PathVariable Long examId) {
        return examArrangeService.listExamRooms(examId);
    }

    /**
     * 读取或查询当前业务场景下需要的数据。
     * 阅读这个方法时，可以重点关注它读取了哪些输入、修改了哪些状态，以及异常或边界条件如何处理。
     */
    @GetMapping("/users")
    @PreAuthorize("hasRole('ADMIN')")
    public List<Map<String, Object>> listUsers(
            @RequestParam(required = false) String role,
            @RequestParam(required = false) Long schoolId,
            @RequestParam(required = false) String keyword,
            @RequestParam(required = false) Integer enabled) {
        String normalizedRole = trimToNull(role);
        String normalizedKeyword = trimToNull(keyword);
        if ("TEACHER".equalsIgnoreCase(normalizedRole)) {
            return teacherMapper.selectTeachersForAdmin(schoolId, normalizedKeyword, enabled);
        }
        if ("STUDENT".equalsIgnoreCase(normalizedRole)) {
            return studentMapper.selectStudentsForAdmin(schoolId, normalizedKeyword, enabled);
        }
        List<Map<String, Object>> merged = new ArrayList<>();
        merged.addAll(teacherMapper.selectTeachersForAdmin(schoolId, normalizedKeyword, enabled));
        merged.addAll(studentMapper.selectStudentsForAdmin(schoolId, normalizedKeyword, enabled));
        merged.sort(Comparator.comparing(
                item -> String.valueOf(item.getOrDefault("createdAt", "")),
                Comparator.reverseOrder()));
        return merged;
    }

    /**
     * 执行删除、重置或状态切换操作，并处理随后的收尾动作。
     * 阅读这个方法时，可以重点关注它读取了哪些输入、修改了哪些状态，以及异常或边界条件如何处理。
     */
    @PostMapping("/users/{userId}/toggle-enabled")
    @PreAuthorize("hasRole('ADMIN')")
    public Map<String, Object> toggleUserEnabled(
            @PathVariable Long userId,
            @RequestBody Map<String, Object> req) {
        UserEntity user = requireUser(userId, "账号不存在");
        if (!isManagedUserRole(user.getRole())) {
            throw new BusinessException("BAD_REQUEST", "仅老师和学生账号允许在此操作");
        }
        boolean enabled = parseEnabled(req.get("enabled"));
        userMapper.update(null, new LambdaUpdateWrapper<UserEntity>()
                .eq(UserEntity::getId, userId)
                .set(UserEntity::getEnabled, enabled ? 1 : 0));
        auditLogService.logCurrent(enabled ? "ACCOUNT_ENABLE" : "ACCOUNT_FREEZE", user.getRole(), String.valueOf(userId), enabled ? "启用账号" : "冻结账号", "角色：" + user.getRole() + " ｜ 用户ID：" + userId);
        return Map.of("ok", true, "enabled", enabled);
    }

    /**
     * 执行删除、重置或状态切换操作，并处理随后的收尾动作。
     * 阅读这个方法时，可以重点关注它读取了哪些输入、修改了哪些状态，以及异常或边界条件如何处理。
     */
    @PostMapping("/users/{userId}/reset-password")
    @PreAuthorize("hasRole('ADMIN')")
    public Map<String, Object> resetUserPassword(@PathVariable Long userId) {
        UserEntity user = requireUser(userId, "账号不存在");
        if (!isManagedUserRole(user.getRole())) {
            throw new BusinessException("BAD_REQUEST", "仅老师和学生账号允许在此操作");
        }
        Map<String, Object> result = resetPasswordForUser(userId);
        auditLogService.logCurrent("PASSWORD_RESET", user.getRole(), String.valueOf(userId), "重置账号密码", "角色：" + user.getRole() + " ｜ 用户ID：" + userId);
        return result;
    }

    /**
     * 封装当前类中的一段独立业务步骤，减少调用方直接处理过多细节。
     * 阅读这个方法时，可以重点关注它读取了哪些输入、修改了哪些状态，以及异常或边界条件如何处理。
     */
    @GetMapping("/settings")
    @PreAuthorize("hasRole('ADMIN')")
    public Map<String, Object> settings() {
        Map<String, Object> settings = new LinkedHashMap<>(platformSettingService.getGroupedSettings());
        settings.put("storage", storageGovernanceService.getStorageOverview());
        settings.put("ok", true);
        return settings;
    }

    /**
     * 更新当前业务状态，并把变更写回数据库、内存或界面状态。
     * 阅读这个方法时，可以重点关注它读取了哪些输入、修改了哪些状态，以及异常或边界条件如何处理。
     */
    @PutMapping("/settings")
    @PreAuthorize("hasRole('ADMIN')")
    @SuppressWarnings("unchecked")
    public Map<String, Object> updateSettings(@RequestBody Map<String, Object> req) {
        req.forEach((group, value) -> {
            if (value instanceof Map<?, ?> groupMap) {
                platformSettingService.updateGroup(group, (Map<String, Object>) groupMap, null);
            }
        });
        auditLogService.logCurrent("SETTINGS_UPDATE", "PLATFORM_SETTINGS", "all", "更新平台参数", "已保存平台参数配置");
        return settings();
    }

    /**
     * 封装当前类中的一段独立业务步骤，减少调用方直接处理过多细节。
     * 阅读这个方法时，可以重点关注它读取了哪些输入、修改了哪些状态，以及异常或边界条件如何处理。
     */
    @PostMapping("/settings/storage/cleanup")
    @PreAuthorize("hasRole('ADMIN')")
    public Map<String, Object> cleanupStorage() {
        Map<String, Object> result = storageGovernanceService.cleanupExpired();
        result.put("storage", storageGovernanceService.getStorageOverview());
        return result;
    }

    /**
     * 封装当前类中的一段独立业务步骤，减少调用方直接处理过多细节。
     * 阅读这个方法时，可以重点关注它读取了哪些输入、修改了哪些状态，以及异常或边界条件如何处理。
     */
    @GetMapping("/notification-templates")
    @PreAuthorize("hasRole('ADMIN')")
    public Map<String, Object> notificationTemplates() {
        return Map.of("ok", true, "items", notificationTemplateService.listTemplates());
    }

    /**
     * 更新当前业务状态，并把变更写回数据库、内存或界面状态。
     * 阅读这个方法时，可以重点关注它读取了哪些输入、修改了哪些状态，以及异常或边界条件如何处理。
     */
    @PutMapping("/notification-templates/{templateCode}")
    @PreAuthorize("hasRole('ADMIN')")
    public Map<String, Object> updateNotificationTemplate(
            @PathVariable String templateCode,
            @RequestBody Map<String, Object> req) {
        notificationTemplateService.updateTemplate(
                templateCode,
                String.valueOf(req.getOrDefault("channel", "EMAIL")),
                String.valueOf(req.getOrDefault("subject", "")),
                String.valueOf(req.getOrDefault("content", "")),
                parseEnabled(req.getOrDefault("enabled", true)),
                null);
        auditLogService.logCurrent("TEMPLATE_UPDATE", "NOTIFICATION_TEMPLATE", templateCode, "更新通知模板", "模板：" + templateCode);
        return Map.of("ok", true, "item", notificationTemplateService.getTemplate(templateCode));
    }

    /**
     * 封装当前类中的一段独立业务步骤，减少调用方直接处理过多细节。
     * 阅读这个方法时，可以重点关注它读取了哪些输入、修改了哪些状态，以及异常或边界条件如何处理。
     */
    @GetMapping("/recent-activities")
    @PreAuthorize("hasRole('ADMIN')")
    public List<Map<String, Object>> recentActivities() {
        return auditLogService.listRecent(100);
    }

    /**
     * 执行删除、重置或状态切换操作，并处理随后的收尾动作。
     * 阅读这个方法时，可以重点关注它读取了哪些输入、修改了哪些状态，以及异常或边界条件如何处理。
     */
    private Map<String, Object> resetPasswordForUser(Long userId) {
        UserEntity user = requireUser(userId, "账号不存在");
        String rawPwd = passwordGen.gen6();
        userMapper.update(null, new LambdaUpdateWrapper<UserEntity>()
                .eq(UserEntity::getId, userId)
                .set(UserEntity::getPassword, passwordEncoder.encode(rawPwd))
                .set(UserEntity::getMustChangePassword, 1)
                .set(UserEntity::getFailedLoginAttempts, 0)
                .set(UserEntity::getLockedUntil, null));
        boolean mailSent = mailService.sendPasswordReset(user.getEmail(), firstNonBlank(user.getName(), "用户"), user.getEmail(), rawPwd);
        return Map.of(
                "ok", true,
                "mailSent", mailSent,
                "tempPassword", rawPwd);
    }

    /**
     * 执行前置校验或条件判断，为后续主流程提供可靠分支依据。
     * 阅读这个方法时，可以重点关注它读取了哪些输入、修改了哪些状态，以及异常或边界条件如何处理。
     */
    private void ensureSchoolAdmin(Long userId) {
        if (schoolAdminMapper.selectById(userId) == null) {
            throw new BusinessException("NOT_FOUND", "学校管理员账号不存在");
        }
    }

    /**
     * 执行前置校验或条件判断，为后续主流程提供可靠分支依据。
     * 阅读这个方法时，可以重点关注它读取了哪些输入、修改了哪些状态，以及异常或边界条件如何处理。
     */
    private void ensureSchoolNameUnique(String schoolName, Long selfId) {
        SchoolEntity existed = schoolMapper.selectOne(new LambdaQueryWrapper<SchoolEntity>()
                .eq(SchoolEntity::getName, schoolName)
                .ne(selfId != null, SchoolEntity::getId, selfId));
        if (existed != null) {
            throw new BusinessException("SCHOOL_EXISTS", "学校名称已存在：" + schoolName);
        }
    }

    /**
     * 执行前置校验或条件判断，为后续主流程提供可靠分支依据。
     * 阅读这个方法时，可以重点关注它读取了哪些输入、修改了哪些状态，以及异常或边界条件如何处理。
     */
    private void ensureEmailUnique(String email, Long selfId) {
        UserEntity existed = userMapper.selectOne(new LambdaQueryWrapper<UserEntity>()
                .eq(UserEntity::getEmail, email)
                .ne(selfId != null, UserEntity::getId, selfId));
        if (existed != null) {
            throw new BusinessException("EMAIL_EXISTS", "邮箱已存在：" + email);
        }
    }

    /**
     * 执行前置校验或条件判断，为后续主流程提供可靠分支依据。
     * 阅读这个方法时，可以重点关注它读取了哪些输入、修改了哪些状态，以及异常或边界条件如何处理。
     */
    private SchoolEntity requireSchool(Long schoolId) {
        SchoolEntity school = schoolMapper.selectById(schoolId);
        if (school == null) {
            throw new BusinessException("NOT_FOUND", "学校不存在");
        }
        return school;
    }

    /**
     * 执行前置校验或条件判断，为后续主流程提供可靠分支依据。
     * 阅读这个方法时，可以重点关注它读取了哪些输入、修改了哪些状态，以及异常或边界条件如何处理。
     */
    private UserEntity requireUser(Long userId, String msg) {
        UserEntity user = userMapper.selectById(userId);
        if (user == null) {
            throw new BusinessException("NOT_FOUND", msg);
        }
        return user;
    }

    /**
     * 执行前置校验或条件判断，为后续主流程提供可靠分支依据。
     * 阅读这个方法时，可以重点关注它读取了哪些输入、修改了哪些状态，以及异常或边界条件如何处理。
     */
    private boolean isManagedUserRole(String role) {
        return Objects.equals("TEACHER", role) || Objects.equals("STUDENT", role);
    }

    /**
     * 封装当前类中的一段独立业务步骤，减少调用方直接处理过多细节。
     * 阅读这个方法时，可以重点关注它读取了哪些输入、修改了哪些状态，以及异常或边界条件如何处理。
     */
    private boolean parseEnabled(Object raw) {
        if (raw instanceof Boolean value) {
            return value;
        }
        if (raw instanceof Number number) {
            return number.intValue() != 0;
        }
        return Boolean.parseBoolean(String.valueOf(raw));
    }

    /**
     * 执行前置校验或条件判断，为后续主流程提供可靠分支依据。
     * 阅读这个方法时，可以重点关注它读取了哪些输入、修改了哪些状态，以及异常或边界条件如何处理。
     */
    private String requireText(String value, String message) {
        String text = trimToNull(value);
        if (text == null) {
            throw new BusinessException("BAD_REQUEST", message);
        }
        return text;
    }

    private String trimToNull(String value) {
        if (value == null) {
            return null;
        }
        String text = value.trim();
        return text.isEmpty() ? null : text;
    }

    private String firstNonBlank(String... values) {
        if (values == null) {
            return "";
        }
        for (String value : values) {
            if (value != null && !value.isBlank()) {
                return value.trim();
            }
        }
        return "";
    }
}
