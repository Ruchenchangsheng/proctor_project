package com.kovr.proctor.api;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.kovr.proctor.api.dto.*;
import com.kovr.proctor.common.BusinessException;
import com.kovr.proctor.domain.entity.*;
import com.kovr.proctor.infra.mapper.*;
import com.kovr.proctor.security.UserDetailsImpl;
import com.kovr.proctor.service.ExamArrangeService;
import com.kovr.proctor.service.FaceClient;
import com.kovr.proctor.service.MailService;
import com.kovr.proctor.service.AuditLogService;
import com.kovr.proctor.util.PasswordGen;
import com.kovr.proctor.service.AnomalyPolicyService;
import com.kovr.proctor.service.BulkImportSupportService;
import lombok.RequiredArgsConstructor;
import jakarta.validation.Valid;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
/**
 * SchoolAdminController 负责学校管理员端的组织、人员、考试和策略管理接口。
 */

@RestController
@RequestMapping("/api/school")
@RequiredArgsConstructor
public class SchoolAdminController {
    private final SchoolAdminMapper sap;
    private final SchoolMapper sm;
    private final DepartmentMapper dm;
    private final MajorMapper mm;
    private final UserMapper um;
    private final TeacherMapper tp;
    private final StudentMapper sp;
    private final ExamMapper examMapper;
    private final ExamSessionMapper examSessionMapper;
    private final PasswordGen gen;
    private final PasswordEncoder pe;
    private final MailService mail;
    private final FaceClient face;
    private final TeacherMapper teacherMapper;
    private final StudentMapper studentMapper;
    private final ExamArrangeService examArrangeService;
    private final BulkImportSupportService bulkImportSupportService;
    private final AuditLogService auditLogService;

    private final AnomalyPolicyService anomalyPolicyService;

    /**
     * 封装当前类中的一段独立业务步骤，减少调用方直接处理过多细节。
     * 阅读这个方法时，可以重点关注它读取了哪些输入、修改了哪些状态，以及异常或边界条件如何处理。
     */
    @GetMapping("/my")
    @PreAuthorize("hasRole('SCHOOL_ADMIN')")
    public SchoolEntity mySchool(@AuthenticationPrincipal UserDetailsImpl u) {
        var p = sap.selectById(u.getId());
        return p == null ? null : sm.selectById(p.getSchoolId());
    }

    /**
     * 读取或查询当前业务场景下需要的数据。
     * 阅读这个方法时，可以重点关注它读取了哪些输入、修改了哪些状态，以及异常或边界条件如何处理。
     */
    @GetMapping("/{schoolId}/departments")
    @PreAuthorize("hasRole('SCHOOL_ADMIN')")
    public List<DepartmentEntity> listDepts(
            @PathVariable Long schoolId,
            @RequestParam(required = false) String keyword,
            @AuthenticationPrincipal UserDetailsImpl u) {
        ensureSchoolAccess(schoolId, u);
        return dm.selectList(new LambdaQueryWrapper<DepartmentEntity>()
                .eq(DepartmentEntity::getSchoolId, schoolId)
                .like(hasText(keyword), DepartmentEntity::getName, keyword == null ? null : keyword.trim())
                .orderByDesc(DepartmentEntity::getId));
    }

    /**
     * 读取或查询当前业务场景下需要的数据。
     * 阅读这个方法时，可以重点关注它读取了哪些输入、修改了哪些状态，以及异常或边界条件如何处理。
     */
    @GetMapping("/{schoolId}/majors")
    @PreAuthorize("hasRole('SCHOOL_ADMIN')")
    public List<MajorEntity> listMajors(
            @PathVariable Long schoolId,
            @RequestParam Long departmentId,
            @RequestParam(required = false) String keyword,
            @AuthenticationPrincipal UserDetailsImpl u) {
        ensureSchoolAccess(schoolId, u);
        requireDepartment(schoolId, departmentId);
        return mm.selectList(new LambdaQueryWrapper<MajorEntity>()
                .eq(MajorEntity::getDepartmentId, departmentId)
                .like(hasText(keyword), MajorEntity::getName, keyword == null ? null : keyword.trim())
                .orderByDesc(MajorEntity::getId));
    }

    /**
     * 读取或查询当前业务场景下需要的数据。
     * 阅读这个方法时，可以重点关注它读取了哪些输入、修改了哪些状态，以及异常或边界条件如何处理。
     */
    @GetMapping("/{schoolId}/teachers")
    @PreAuthorize("hasRole('SCHOOL_ADMIN')")
    public List<Map<String, Object>> listTeachers(
            @PathVariable Long schoolId,
            @RequestParam(required = false) Long departmentId,
            @RequestParam(required = false) Long majorId,
            @RequestParam(required = false) String keyword,
            @AuthenticationPrincipal UserDetailsImpl u) {
        ensureSchoolAccess(schoolId, u);
        return teacherMapper.selectTeachersBySchool(schoolId, departmentId, majorId, trimToNull(keyword));
    }

    /**
     * 读取或查询当前业务场景下需要的数据。
     * 阅读这个方法时，可以重点关注它读取了哪些输入、修改了哪些状态，以及异常或边界条件如何处理。
     */
    @GetMapping("/{schoolId}/students")
    @PreAuthorize("hasRole('SCHOOL_ADMIN')")
    public List<Map<String, Object>> listStudents(
            @PathVariable Long schoolId,
            @RequestParam(required = false) Long departmentId,
            @RequestParam(required = false) Long majorId,
            @RequestParam(required = false) String keyword,
            @AuthenticationPrincipal UserDetailsImpl u) {
        ensureSchoolAccess(schoolId, u);
        return studentMapper.selectStudentsBySchool(schoolId, departmentId, majorId, trimToNull(keyword));
    }

    /**
     * 创建并组装当前业务对象或执行一段创建型流程。
     * 阅读这个方法时，可以重点关注它读取了哪些输入、修改了哪些状态，以及异常或边界条件如何处理。
     */
    @PostMapping("/{schoolId}/departments")
    @PreAuthorize("hasRole('SCHOOL_ADMIN')")
    public Map<String, Object> createDept(
            @PathVariable Long schoolId,
            @RequestBody CreateDeptReq req,
            @AuthenticationPrincipal UserDetailsImpl u) {
        ensureSchoolAccess(schoolId, u);
        var d = new DepartmentEntity();
        d.setSchoolId(schoolId);
        d.setName(requireName(req.name(), "学院名称不能为空"));
        dm.insert(d);
        return Map.of("departmentId", d.getId());
    }

    /**
     * 创建并组装当前业务对象或执行一段创建型流程。
     * 阅读这个方法时，可以重点关注它读取了哪些输入、修改了哪些状态，以及异常或边界条件如何处理。
     */
    @PostMapping("/{schoolId}/majors")
    @PreAuthorize("hasRole('SCHOOL_ADMIN')")
    public Map<String, Object> createMajor(
            @PathVariable Long schoolId,
            @RequestBody CreateMajorReq req,
            @AuthenticationPrincipal UserDetailsImpl u) {
        ensureSchoolAccess(schoolId, u);
        requireDepartment(schoolId, req.departmentId());
        var m = new MajorEntity();
        m.setDepartmentId(req.departmentId());
        m.setName(requireName(req.name(), "专业名称不能为空"));
        mm.insert(m);
        return Map.of("majorId", m.getId());
    }

    /**
     * 创建并组装当前业务对象或执行一段创建型流程。
     * 阅读这个方法时，可以重点关注它读取了哪些输入、修改了哪些状态，以及异常或边界条件如何处理。
     */
    @PostMapping("/{schoolId}/teachers")
    @PreAuthorize("hasRole('SCHOOL_ADMIN')")
    @Transactional
    public Map<String, Object> createTeacher(
            @PathVariable Long schoolId,
            @RequestBody CreateTeacherReq req,
            @AuthenticationPrincipal UserDetailsImpl u) {
        ensureSchoolAccess(schoolId, u);
        requireDepartment(schoolId, req.departmentId());
        requireMajor(schoolId, req.majorId());
        String raw = gen.gen6();
        var user = new UserEntity();
        user.setEmail(req.email());
        user.setName(req.name());
        user.setRole("TEACHER");
        user.setPassword(pe.encode(raw));
        user.setEnabled(1);
        user.setMustChangePassword(1);
        user.setFailedLoginAttempts(0);
        um.insert(user);
        var p = new TeacherEntity();
        p.setUserId(user.getId());
        p.setSchoolId(schoolId);
        p.setDepartmentId(req.departmentId());
        p.setMajorId(req.majorId());
        tp.insert(p);
        mail.sendAccount(req.email(), req.name(), req.email(), raw);
        auditLogService.logCurrent("ACCOUNT_CREATE", "TEACHER", String.valueOf(user.getId()), "创建老师账号", "老师：" + req.name() + " ｜ 邮箱：" + req.email());
        return Map.of("userId", user.getId());
    }

    /**
     * 封装当前类中的一段独立业务步骤，减少调用方直接处理过多细节。
     * 阅读这个方法时，可以重点关注它读取了哪些输入、修改了哪些状态，以及异常或边界条件如何处理。
     */
    @PostMapping(value = "/{schoolId}/teachers/import", consumes = "multipart/form-data")
    @PreAuthorize("hasRole('SCHOOL_ADMIN')")
    public Map<String, Object> importTeachers(
            @PathVariable Long schoolId,
            @RequestPart("file") MultipartFile file,
            @AuthenticationPrincipal UserDetailsImpl u) throws Exception {
        ensureSchoolAccess(schoolId, u);
        List<Map<String, String>> rows = bulkImportSupportService.parseCsv(file.getBytes());
        int successCount = 0;
        List<Map<String, String>> failures = new ArrayList<>();
        for (Map<String, String> row : rows) {
            try {
                DepartmentEntity department = requireDepartmentByName(schoolId, row.get("department"));
                MajorEntity major = requireMajorByName(schoolId, department.getId(), row.get("major"));
                createTeacherAccount(schoolId, requireEmail(row.get("email")), requireName(row.get("name"), "老师姓名不能为空"), department.getId(), major.getId());
                successCount++;
            } catch (Exception ex) {
                failures.add(Map.of(
                        "rowNum", String.valueOf(row.getOrDefault("_rowNum", "?")),
                        "message", ex.getMessage() == null ? "导入失败" : ex.getMessage()));
            }
        }
        auditLogService.logCurrent("BULK_IMPORT", "TEACHER", String.valueOf(schoolId), "批量导入老师", "成功：" + successCount + " ｜ 失败：" + failures.size());
        return Map.of("ok", true, "successCount", successCount, "failureCount", failures.size(), "failures", failures);
    }

    /**
     * 创建并组装当前业务对象或执行一段创建型流程。
     * 阅读这个方法时，可以重点关注它读取了哪些输入、修改了哪些状态，以及异常或边界条件如何处理。
     */
    @PostMapping(value = "/{schoolId}/students", consumes = "multipart/form-data")
    @PreAuthorize("hasRole('SCHOOL_ADMIN')")
    @Transactional
    public Map<String, Object> createStudent(
            @PathVariable Long schoolId,
            @RequestParam String email,
            @RequestParam String name,
            @RequestParam Long departmentId,
            @RequestParam(required = false) Long majorId,
            @RequestPart("photo") MultipartFile photo,
            @AuthenticationPrincipal UserDetailsImpl u) throws Exception {
        ensureSchoolAccess(schoolId, u);
        requireDepartment(schoolId, departmentId);
        if (majorId != null) {
            requireMajor(schoolId, majorId);
        }
        String raw = gen.gen6();
        var user = new UserEntity();
        user.setEmail(email);
        user.setName(name);
        user.setRole("STUDENT");
        user.setPassword(pe.encode(raw));
        user.setEnabled(1);
        user.setMustChangePassword(1);
        user.setFailedLoginAttempts(0);
        um.insert(user);
        byte[] bytes = photo.getBytes();
        String mime = photo.getContentType();
        var f = face.extract(mime, bytes);
        var p = new StudentEntity();
        p.setUserId(user.getId());
        p.setSchoolId(schoolId);
        p.setDepartmentId(departmentId);
        p.setMajorId(majorId);
        p.setFacePhoto(bytes);
        p.setFacePhotoMime(f.getMime());
        p.setFacePhotoSha256(f.getSha256());
        p.setFaceEmbeddingJson(f.getJson());
        p.setFaceEmbeddingDim((short) f.getDim());
        p.setFaceDetScore(java.math.BigDecimal.valueOf(f.getScore()));
        sp.insert(p);
        mail.sendAccount(email, name, email, raw);
        auditLogService.logCurrent("ACCOUNT_CREATE", "STUDENT", String.valueOf(user.getId()), "创建学生账号", "学生：" + name + " ｜ 邮箱：" + email);
        return Map.of("userId", user.getId());
    }

    /**
     * 封装当前类中的一段独立业务步骤，减少调用方直接处理过多细节。
     * 阅读这个方法时，可以重点关注它读取了哪些输入、修改了哪些状态，以及异常或边界条件如何处理。
     */
    @PostMapping(value = "/{schoolId}/students/import", consumes = "multipart/form-data")
    @PreAuthorize("hasRole('SCHOOL_ADMIN')")
    public Map<String, Object> importStudents(
            @PathVariable Long schoolId,
            @RequestPart("archive") MultipartFile archive,
            @AuthenticationPrincipal UserDetailsImpl u) throws Exception {
        ensureSchoolAccess(schoolId, u);
        var bundle = bulkImportSupportService.parseZip(archive.getBytes());
        byte[] csvBytes = bundle.get("students.csv");
        if (csvBytes == null) {
            throw new BusinessException("BAD_REQUEST", "压缩包中缺少 students.csv");
        }
        List<Map<String, String>> rows = bulkImportSupportService.parseCsv(csvBytes);
        int successCount = 0;
        List<Map<String, String>> failures = new ArrayList<>();
        for (Map<String, String> row : rows) {
            try {
                DepartmentEntity department = requireDepartmentByName(schoolId, row.get("department"));
                MajorEntity major = requireMajorByName(schoolId, department.getId(), row.get("major"));
                byte[] photoBytes = resolvePhotoBytes(bundle, row.get("photoFile"));
                createStudentAccount(schoolId, requireEmail(row.get("email")), requireName(row.get("name"), "学生姓名不能为空"), department.getId(), major.getId(), row.get("photoFile"), photoBytes);
                successCount++;
            } catch (Exception ex) {
                failures.add(Map.of(
                        "rowNum", String.valueOf(row.getOrDefault("_rowNum", "?")),
                        "message", ex.getMessage() == null ? "导入失败" : ex.getMessage()));
            }
        }
        auditLogService.logCurrent("BULK_IMPORT", "STUDENT", String.valueOf(schoolId), "批量导入学生", "成功：" + successCount + " ｜ 失败：" + failures.size());
        return Map.of("ok", true, "successCount", successCount, "failureCount", failures.size(), "failures", failures);
    }

    /**
     * 读取或查询当前业务场景下需要的数据。
     * 阅读这个方法时，可以重点关注它读取了哪些输入、修改了哪些状态，以及异常或边界条件如何处理。
     */
    @GetMapping("/{schoolId}/anomaly-policy")
    @PreAuthorize("hasRole('SCHOOL_ADMIN')")
    public Map<String, Object> getAnomalyPolicy(
            @PathVariable Long schoolId,
            @AuthenticationPrincipal UserDetailsImpl u) {
        var admin = sap.selectById(u.getId());
        if (admin == null || !schoolId.equals(admin.getSchoolId())) {
            return Map.of("ok", false, "msg", "无权限访问该学校配置");
        }
        var policy = anomalyPolicyService.getPolicy(schoolId);
        return Map.of("ok", true, "policy", anomalyPolicyService.asMap(policy));
    }

    /**
     * 更新当前业务状态，并把变更写回数据库、内存或界面状态。
     * 阅读这个方法时，可以重点关注它读取了哪些输入、修改了哪些状态，以及异常或边界条件如何处理。
     */
    @PutMapping("/{schoolId}/anomaly-policy")
    @PreAuthorize("hasRole('SCHOOL_ADMIN')")
    public Map<String, Object> updateAnomalyPolicy(
            @PathVariable Long schoolId,
            @AuthenticationPrincipal UserDetailsImpl u,
            @RequestBody UpdateAnomalyPolicyReq req) {
        var admin = sap.selectById(u.getId());
        if (admin == null || !schoolId.equals(admin.getSchoolId())) {
            return Map.of("ok", false, "msg", "无权限访问该学校配置");
        }
        var policy = anomalyPolicyService.updatePolicy(schoolId, req.warningThreshold(), req.severeThreshold(), req.sampleIntervalMs(), req.identityVerifyIntervalSec(), req.maxReconnectCount());
        return Map.of("ok", true, "policy", anomalyPolicyService.asMap(policy));
    }

    /**
     * 创建并组装当前业务对象或执行一段创建型流程。
     * 阅读这个方法时，可以重点关注它读取了哪些输入、修改了哪些状态，以及异常或边界条件如何处理。
     */
    @PostMapping("/{schoolId}/exams")
    @PreAuthorize("hasRole('SCHOOL_ADMIN')")
    public Map<String, Object> createExam(
            @PathVariable Long schoolId,
            @AuthenticationPrincipal UserDetailsImpl u,
            @RequestBody CreateExamReq req) {
        ensureSchoolAccess(schoolId, u);
        Map<String, Object> result = examArrangeService.createExam(schoolId, u.getId(), req);
        auditLogService.logCurrent("EXAM_CREATE", "EXAM", String.valueOf(result.get("examId")), "创建考试", "考试：" + result.get("examName"));
        return result;
    }

    /**
     * 读取或查询当前业务场景下需要的数据。
     * 阅读这个方法时，可以重点关注它读取了哪些输入、修改了哪些状态，以及异常或边界条件如何处理。
     */
    @GetMapping("/{schoolId}/exams")
    @PreAuthorize("hasRole('SCHOOL_ADMIN')")
    public List<Map<String, Object>> listExams(
            @PathVariable Long schoolId,
            @RequestParam(required = false) Long departmentId,
            @RequestParam(required = false) Long majorId,
            @RequestParam(required = false) String keyword,
            @RequestParam(required = false) String status,
            @AuthenticationPrincipal UserDetailsImpl u) {
        ensureSchoolAccess(schoolId, u);
        return examArrangeService.listExams(schoolId, departmentId, majorId, keyword, status);
    }

    /**
     * 读取或查询当前业务场景下需要的数据。
     * 阅读这个方法时，可以重点关注它读取了哪些输入、修改了哪些状态，以及异常或边界条件如何处理。
     */
    @GetMapping("/{schoolId}/exams/{examId}/rooms")
    @PreAuthorize("hasRole('SCHOOL_ADMIN')")
    public List<Map<String, Object>> listExamRooms(
            @PathVariable Long schoolId,
            @PathVariable Long examId,
            @AuthenticationPrincipal UserDetailsImpl u) {
        ensureSchoolAccess(schoolId, u);
        return examArrangeService.listExamRooms(examId);
    }

    /**
     * 封装当前类中的一段独立业务步骤，减少调用方直接处理过多细节。
     * 阅读这个方法时，可以重点关注它读取了哪些输入、修改了哪些状态，以及异常或边界条件如何处理。
     */
    @GetMapping(value = "/{schoolId}/exams/{examId}/results/export", produces = "text/csv")
    @PreAuthorize("hasRole('SCHOOL_ADMIN')")
    public ResponseEntity<String> exportExamResults(
            @PathVariable Long schoolId,
            @PathVariable Long examId,
            @AuthenticationPrincipal UserDetailsImpl u) {
        ensureSchoolAccess(schoolId, u);
        ExamEntity exam = examMapper.selectById(examId);
        if (exam == null || !Objects.equals(exam.getSchoolId(), schoolId)) {
            throw new BusinessException("NOT_FOUND", "考试不存在");
        }
        List<Map<String, Object>> rows = examSessionMapper.selectResultRowsByExamId(examId);
        StringBuilder csv = new StringBuilder();
        csv.append('\uFEFF');
        csv.append("roomId,studentName,studentEmail,sessionStatus,enteredAt,finishedAt,evidenceCount,confirmedCount\n");
        for (Map<String, Object> row : rows) {
            csv.append(csv(row.get("roomId"))).append(',')
                    .append(csv(row.get("studentName"))).append(',')
                    .append(csv(row.get("studentEmail"))).append(',')
                    .append(csv(row.get("sessionStatus"))).append(',')
                    .append(csv(row.get("enteredAt"))).append(',')
                    .append(csv(row.get("finishedAt"))).append(',')
                    .append(csv(row.get("evidenceCount"))).append(',')
                    .append(csv(row.get("confirmedCount"))).append('\n');
        }
        auditLogService.logCurrent("RESULT_EXPORT", "EXAM", String.valueOf(examId), "导出考试结果", "考试：" + exam.getName() + " ｜ 条数：" + rows.size());
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType("text/csv;charset=UTF-8"))
                .header("Content-Disposition", "attachment; filename=\"exam-results-" + examId + ".csv\"")
                .body(csv.toString());
    }

    /**
     * 更新当前业务状态，并把变更写回数据库、内存或界面状态。
     * 阅读这个方法时，可以重点关注它读取了哪些输入、修改了哪些状态，以及异常或边界条件如何处理。
     */
    @PutMapping("/{schoolId}/departments/{departmentId}")
    @PreAuthorize("hasRole('SCHOOL_ADMIN')")
    public Map<String, Object> updateDept(
            @PathVariable Long schoolId,
            @PathVariable Long departmentId,
            @RequestBody UpdateDeptReq req,
            @AuthenticationPrincipal UserDetailsImpl u) {
        ensureSchoolAccess(schoolId, u);
        DepartmentEntity department = requireDepartment(schoolId, departmentId);
        department.setName(requireName(req.name(), "学院名称不能为空"));
        dm.updateById(department);
        return Map.of("ok", true);
    }

    /**
     * 执行删除、重置或状态切换操作，并处理随后的收尾动作。
     * 阅读这个方法时，可以重点关注它读取了哪些输入、修改了哪些状态，以及异常或边界条件如何处理。
     */
    @DeleteMapping("/{schoolId}/departments/{departmentId}")
    @PreAuthorize("hasRole('SCHOOL_ADMIN')")
    public Map<String, Object> deleteDept(
            @PathVariable Long schoolId,
            @PathVariable Long departmentId,
            @AuthenticationPrincipal UserDetailsImpl u) {
        ensureSchoolAccess(schoolId, u);
        requireDepartment(schoolId, departmentId);
        if (mm.selectCount(new LambdaQueryWrapper<MajorEntity>().eq(MajorEntity::getDepartmentId, departmentId)) > 0) {
            throw new BusinessException("DEPARTMENT_HAS_MAJORS", "该学院下仍有专业，无法删除");
        }
        if (tp.selectCount(new LambdaQueryWrapper<TeacherEntity>().eq(TeacherEntity::getDepartmentId, departmentId)) > 0) {
            throw new BusinessException("DEPARTMENT_HAS_TEACHERS", "该学院下仍有关联老师，无法删除");
        }
        if (sp.selectCount(new LambdaQueryWrapper<StudentEntity>().eq(StudentEntity::getDepartmentId, departmentId)) > 0) {
            throw new BusinessException("DEPARTMENT_HAS_STUDENTS", "该学院下仍有关联学生，无法删除");
        }
        if (examMapper.selectCount(new LambdaQueryWrapper<ExamEntity>().eq(ExamEntity::getDepartmentId, departmentId)) > 0) {
            throw new BusinessException("DEPARTMENT_HAS_EXAMS", "该学院下仍有关联考试，无法删除");
        }
        dm.deleteById(departmentId);
        return Map.of("ok", true);
    }

    /**
     * 更新当前业务状态，并把变更写回数据库、内存或界面状态。
     * 阅读这个方法时，可以重点关注它读取了哪些输入、修改了哪些状态，以及异常或边界条件如何处理。
     */
    @PutMapping("/{schoolId}/majors/{majorId}")
    @PreAuthorize("hasRole('SCHOOL_ADMIN')")
    public Map<String, Object> updateMajor(
            @PathVariable Long schoolId,
            @PathVariable Long majorId,
            @RequestBody UpdateMajorReq req,
            @AuthenticationPrincipal UserDetailsImpl u) {
        ensureSchoolAccess(schoolId, u);
        MajorEntity major = requireMajor(schoolId, majorId);
        if (req.departmentId() != null) {
            requireDepartment(schoolId, req.departmentId());
            major.setDepartmentId(req.departmentId());
        }
        major.setName(requireName(req.name(), "专业名称不能为空"));
        mm.updateById(major);
        return Map.of("ok", true);
    }

    /**
     * 执行删除、重置或状态切换操作，并处理随后的收尾动作。
     * 阅读这个方法时，可以重点关注它读取了哪些输入、修改了哪些状态，以及异常或边界条件如何处理。
     */
    @DeleteMapping("/{schoolId}/majors/{majorId}")
    @PreAuthorize("hasRole('SCHOOL_ADMIN')")
    public Map<String, Object> deleteMajor(
            @PathVariable Long schoolId,
            @PathVariable Long majorId,
            @AuthenticationPrincipal UserDetailsImpl u) {
        ensureSchoolAccess(schoolId, u);
        requireMajor(schoolId, majorId);
        if (tp.selectCount(new LambdaQueryWrapper<TeacherEntity>().eq(TeacherEntity::getMajorId, majorId)) > 0) {
            throw new BusinessException("MAJOR_HAS_TEACHERS", "该专业下仍有关联老师，无法删除");
        }
        if (sp.selectCount(new LambdaQueryWrapper<StudentEntity>().eq(StudentEntity::getMajorId, majorId)) > 0) {
            throw new BusinessException("MAJOR_HAS_STUDENTS", "该专业下仍有关联学生，无法删除");
        }
        if (examMapper.selectCount(new LambdaQueryWrapper<ExamEntity>().eq(ExamEntity::getMajorId, majorId)) > 0) {
            throw new BusinessException("MAJOR_HAS_EXAMS", "该专业下仍有关联考试，无法删除");
        }
        mm.deleteById(majorId);
        return Map.of("ok", true);
    }

    /**
     * 更新当前业务状态，并把变更写回数据库、内存或界面状态。
     * 阅读这个方法时，可以重点关注它读取了哪些输入、修改了哪些状态，以及异常或边界条件如何处理。
     */
    @PutMapping("/{schoolId}/teachers/{teacherUserId}")
    @PreAuthorize("hasRole('SCHOOL_ADMIN')")
    @Transactional
    public Map<String, Object> updateTeacher(
            @PathVariable Long schoolId,
            @PathVariable Long teacherUserId,
            @RequestBody UpdateTeacherReq req,
            @AuthenticationPrincipal UserDetailsImpl u) {
        ensureSchoolAccess(schoolId, u);
        TeacherEntity teacher = requireTeacher(schoolId, teacherUserId);
        requireDepartment(schoolId, req.departmentId());
        requireMajor(schoolId, req.majorId());

        UserEntity user = requireUser(teacherUserId, "老师账号不存在");
        user.setName(requireName(req.name(), "老师姓名不能为空"));
        user.setEmail(requireEmail(req.email()));
        um.updateById(user);

        teacher.setDepartmentId(req.departmentId());
        teacher.setMajorId(req.majorId());
        tp.updateById(teacher);
        return Map.of("ok", true);
    }

    /**
     * 执行删除、重置或状态切换操作，并处理随后的收尾动作。
     * 阅读这个方法时，可以重点关注它读取了哪些输入、修改了哪些状态，以及异常或边界条件如何处理。
     */
    @PostMapping("/{schoolId}/teachers/{teacherUserId}/toggle-enabled")
    @PreAuthorize("hasRole('SCHOOL_ADMIN')")
    public Map<String, Object> toggleTeacherEnabled(
            @PathVariable Long schoolId,
            @PathVariable Long teacherUserId,
            @RequestBody @Valid ToggleEnabledReq req,
            @AuthenticationPrincipal UserDetailsImpl u) {
        ensureSchoolAccess(schoolId, u);
        requireTeacher(schoolId, teacherUserId);
        Map<String, Object> result = toggleManagedUserEnabled(teacherUserId, req.enabled());
        auditLogService.logCurrent(req.enabled() ? "ACCOUNT_ENABLE" : "ACCOUNT_FREEZE", "TEACHER", String.valueOf(teacherUserId), req.enabled() ? "启用老师账号" : "冻结老师账号", "用户：" + result.get("name"));
        return result;
    }

    /**
     * 执行删除、重置或状态切换操作，并处理随后的收尾动作。
     * 阅读这个方法时，可以重点关注它读取了哪些输入、修改了哪些状态，以及异常或边界条件如何处理。
     */
    @PostMapping("/{schoolId}/teachers/{teacherUserId}/reset-password")
    @PreAuthorize("hasRole('SCHOOL_ADMIN')")
    public Map<String, Object> resetTeacherPassword(
            @PathVariable Long schoolId,
            @PathVariable Long teacherUserId,
            @AuthenticationPrincipal UserDetailsImpl u) {
        ensureSchoolAccess(schoolId, u);
        requireTeacher(schoolId, teacherUserId);
        Map<String, Object> result = resetPasswordForUser(teacherUserId);
        auditLogService.logCurrent("PASSWORD_RESET", "TEACHER", String.valueOf(teacherUserId), "重置老师密码", "用户ID：" + teacherUserId);
        return result;
    }

    /**
     * 执行删除、重置或状态切换操作，并处理随后的收尾动作。
     * 阅读这个方法时，可以重点关注它读取了哪些输入、修改了哪些状态，以及异常或边界条件如何处理。
     */
    @DeleteMapping("/{schoolId}/teachers/{teacherUserId}")
    @PreAuthorize("hasRole('SCHOOL_ADMIN')")
    @Transactional
    public Map<String, Object> deleteTeacher(
            @PathVariable Long schoolId,
            @PathVariable Long teacherUserId,
            @AuthenticationPrincipal UserDetailsImpl u) {
        ensureSchoolAccess(schoolId, u);
        requireTeacher(schoolId, teacherUserId);
        if (teacherMapper.countActiveAssignments(teacherUserId) > 0) {
            throw new BusinessException("TEACHER_HAS_ACTIVE_EXAMS", "该老师仍有关联的未结束考试，暂不能删除");
        }
        um.update(null, new LambdaUpdateWrapper<UserEntity>()
                .eq(UserEntity::getId, teacherUserId)
                .set(UserEntity::getEnabled, 0));
        tp.deleteById(teacherUserId);
        return Map.of("ok", true);
    }

    /**
     * 更新当前业务状态，并把变更写回数据库、内存或界面状态。
     * 阅读这个方法时，可以重点关注它读取了哪些输入、修改了哪些状态，以及异常或边界条件如何处理。
     */
    @PutMapping(value = "/{schoolId}/students/{studentUserId}", consumes = "multipart/form-data")
    @PreAuthorize("hasRole('SCHOOL_ADMIN')")
    @Transactional
    public Map<String, Object> updateStudent(
            @PathVariable Long schoolId,
            @PathVariable Long studentUserId,
            @RequestParam String email,
            @RequestParam String name,
            @RequestParam Long departmentId,
            @RequestParam(required = false) Long majorId,
            @RequestPart(value = "photo", required = false) MultipartFile photo,
            @AuthenticationPrincipal UserDetailsImpl u) throws Exception {
        ensureSchoolAccess(schoolId, u);
        StudentEntity student = requireStudent(schoolId, studentUserId);
        requireDepartment(schoolId, departmentId);
        if (majorId != null) {
            requireMajor(schoolId, majorId);
        }

        UserEntity user = requireUser(studentUserId, "学生账号不存在");
        user.setName(requireName(name, "学生姓名不能为空"));
        user.setEmail(requireEmail(email));
        um.updateById(user);

        student.setDepartmentId(departmentId);
        student.setMajorId(majorId);
        if (photo != null && !photo.isEmpty()) {
            byte[] bytes = photo.getBytes();
            String mime = photo.getContentType();
            var f = face.extract(mime, bytes);
            student.setFacePhoto(bytes);
            student.setFacePhotoMime(f.getMime());
            student.setFacePhotoSha256(f.getSha256());
            student.setFaceEmbeddingJson(f.getJson());
            student.setFaceEmbeddingDim((short) f.getDim());
            student.setFaceDetScore(java.math.BigDecimal.valueOf(f.getScore()));
        }
        sp.updateById(student);
        return Map.of("ok", true);
    }

    /**
     * 执行删除、重置或状态切换操作，并处理随后的收尾动作。
     * 阅读这个方法时，可以重点关注它读取了哪些输入、修改了哪些状态，以及异常或边界条件如何处理。
     */
    @PostMapping("/{schoolId}/students/{studentUserId}/toggle-enabled")
    @PreAuthorize("hasRole('SCHOOL_ADMIN')")
    public Map<String, Object> toggleStudentEnabled(
            @PathVariable Long schoolId,
            @PathVariable Long studentUserId,
            @RequestBody @Valid ToggleEnabledReq req,
            @AuthenticationPrincipal UserDetailsImpl u) {
        ensureSchoolAccess(schoolId, u);
        requireStudent(schoolId, studentUserId);
        Map<String, Object> result = toggleManagedUserEnabled(studentUserId, req.enabled());
        auditLogService.logCurrent(req.enabled() ? "ACCOUNT_ENABLE" : "ACCOUNT_FREEZE", "STUDENT", String.valueOf(studentUserId), req.enabled() ? "启用学生账号" : "冻结学生账号", "用户：" + result.get("name"));
        return result;
    }

    /**
     * 执行删除、重置或状态切换操作，并处理随后的收尾动作。
     * 阅读这个方法时，可以重点关注它读取了哪些输入、修改了哪些状态，以及异常或边界条件如何处理。
     */
    @PostMapping("/{schoolId}/students/{studentUserId}/reset-password")
    @PreAuthorize("hasRole('SCHOOL_ADMIN')")
    public Map<String, Object> resetStudentPassword(
            @PathVariable Long schoolId,
            @PathVariable Long studentUserId,
            @AuthenticationPrincipal UserDetailsImpl u) {
        ensureSchoolAccess(schoolId, u);
        requireStudent(schoolId, studentUserId);
        Map<String, Object> result = resetPasswordForUser(studentUserId);
        auditLogService.logCurrent("PASSWORD_RESET", "STUDENT", String.valueOf(studentUserId), "重置学生密码", "用户ID：" + studentUserId);
        return result;
    }

    /**
     * 执行删除、重置或状态切换操作，并处理随后的收尾动作。
     * 阅读这个方法时，可以重点关注它读取了哪些输入、修改了哪些状态，以及异常或边界条件如何处理。
     */
    @DeleteMapping("/{schoolId}/students/{studentUserId}")
    @PreAuthorize("hasRole('SCHOOL_ADMIN')")
    @Transactional
    public Map<String, Object> deleteStudent(
            @PathVariable Long schoolId,
            @PathVariable Long studentUserId,
            @AuthenticationPrincipal UserDetailsImpl u) {
        ensureSchoolAccess(schoolId, u);
        requireStudent(schoolId, studentUserId);
        if (studentMapper.countActiveSessions(studentUserId) > 0) {
            throw new BusinessException("STUDENT_HAS_ACTIVE_EXAMS", "该学生仍有关联的未结束考试，暂不能删除");
        }
        um.update(null, new LambdaUpdateWrapper<UserEntity>()
                .eq(UserEntity::getId, studentUserId)
                .set(UserEntity::getEnabled, 0));
        sp.deleteById(studentUserId);
        return Map.of("ok", true);
    }

    /**
     * 更新当前业务状态，并把变更写回数据库、内存或界面状态。
     * 阅读这个方法时，可以重点关注它读取了哪些输入、修改了哪些状态，以及异常或边界条件如何处理。
     */
    @PutMapping("/{schoolId}/exams/{examId}")
    @PreAuthorize("hasRole('SCHOOL_ADMIN')")
    public Map<String, Object> updateExam(
            @PathVariable Long schoolId,
            @PathVariable Long examId,
            @RequestBody UpdateExamReq req,
            @AuthenticationPrincipal UserDetailsImpl u) {
        ensureSchoolAccess(schoolId, u);
        Map<String, Object> result = examArrangeService.updateExam(schoolId, examId, req);
        auditLogService.logCurrent("EXAM_UPDATE", "EXAM", String.valueOf(examId), "修改考试", "考试：" + result.get("name"));
        return result;
    }

    /**
     * 执行删除、重置或状态切换操作，并处理随后的收尾动作。
     * 阅读这个方法时，可以重点关注它读取了哪些输入、修改了哪些状态，以及异常或边界条件如何处理。
     */
    @DeleteMapping("/{schoolId}/exams/{examId}")
    @PreAuthorize("hasRole('SCHOOL_ADMIN')")
    public Map<String, Object> deleteExam(
            @PathVariable Long schoolId,
            @PathVariable Long examId,
            @AuthenticationPrincipal UserDetailsImpl u) {
        ensureSchoolAccess(schoolId, u);
        examArrangeService.deleteExam(schoolId, examId);
        auditLogService.logCurrent("EXAM_DELETE", "EXAM", String.valueOf(examId), "删除考试", "考试ID：" + examId);
        return Map.of("ok", true);
    }

    /**
     * 执行前置校验或条件判断，为后续主流程提供可靠分支依据。
     * 阅读这个方法时，可以重点关注它读取了哪些输入、修改了哪些状态，以及异常或边界条件如何处理。
     */
    private void ensureSchoolAccess(Long schoolId, UserDetailsImpl u) {
        var admin = sap.selectById(u.getId());
        if (admin == null || !Objects.equals(admin.getSchoolId(), schoolId)) {
            throw new AccessDeniedException("无权限访问该学校");
        }
    }

    /**
     * 执行前置校验或条件判断，为后续主流程提供可靠分支依据。
     * 阅读这个方法时，可以重点关注它读取了哪些输入、修改了哪些状态，以及异常或边界条件如何处理。
     */
    private DepartmentEntity requireDepartment(Long schoolId, Long departmentId) {
        DepartmentEntity department = dm.selectById(departmentId);
        if (department == null || !Objects.equals(department.getSchoolId(), schoolId)) {
            throw new BusinessException("NOT_FOUND", "学院不存在");
        }
        return department;
    }

    /**
     * 执行前置校验或条件判断，为后续主流程提供可靠分支依据。
     * 阅读这个方法时，可以重点关注它读取了哪些输入、修改了哪些状态，以及异常或边界条件如何处理。
     */
    private MajorEntity requireMajor(Long schoolId, Long majorId) {
        MajorEntity major = mm.selectById(majorId);
        if (major == null) {
            throw new BusinessException("NOT_FOUND", "专业不存在");
        }
        DepartmentEntity department = dm.selectById(major.getDepartmentId());
        if (department == null || !Objects.equals(department.getSchoolId(), schoolId)) {
            throw new BusinessException("NOT_FOUND", "专业不存在");
        }
        return major;
    }

    /**
     * 执行前置校验或条件判断，为后续主流程提供可靠分支依据。
     * 阅读这个方法时，可以重点关注它读取了哪些输入、修改了哪些状态，以及异常或边界条件如何处理。
     */
    private TeacherEntity requireTeacher(Long schoolId, Long teacherUserId) {
        TeacherEntity teacher = tp.selectById(teacherUserId);
        if (teacher == null || !Objects.equals(teacher.getSchoolId(), schoolId)) {
            throw new BusinessException("NOT_FOUND", "老师不存在");
        }
        return teacher;
    }

    /**
     * 执行前置校验或条件判断，为后续主流程提供可靠分支依据。
     * 阅读这个方法时，可以重点关注它读取了哪些输入、修改了哪些状态，以及异常或边界条件如何处理。
     */
    private StudentEntity requireStudent(Long schoolId, Long studentUserId) {
        StudentEntity student = sp.selectById(studentUserId);
        if (student == null || !Objects.equals(student.getSchoolId(), schoolId)) {
            throw new BusinessException("NOT_FOUND", "学生不存在");
        }
        return student;
    }

    /**
     * 执行前置校验或条件判断，为后续主流程提供可靠分支依据。
     * 阅读这个方法时，可以重点关注它读取了哪些输入、修改了哪些状态，以及异常或边界条件如何处理。
     */
    private UserEntity requireUser(Long userId, String message) {
        UserEntity user = um.selectById(userId);
        if (user == null) {
            throw new BusinessException("NOT_FOUND", message);
        }
        return user;
    }

    /**
     * 执行删除、重置或状态切换操作，并处理随后的收尾动作。
     * 阅读这个方法时，可以重点关注它读取了哪些输入、修改了哪些状态，以及异常或边界条件如何处理。
     */
    private Map<String, Object> toggleManagedUserEnabled(Long userId, boolean enabled) {
        UserEntity user = requireUser(userId, "账号不存在");
        um.update(null, new LambdaUpdateWrapper<UserEntity>()
                .eq(UserEntity::getId, userId)
                .set(UserEntity::getEnabled, enabled ? 1 : 0));
        return Map.of("ok", true, "enabled", enabled, "name", user.getName());
    }

    /**
     * 执行删除、重置或状态切换操作，并处理随后的收尾动作。
     * 阅读这个方法时，可以重点关注它读取了哪些输入、修改了哪些状态，以及异常或边界条件如何处理。
     */
    private Map<String, Object> resetPasswordForUser(Long userId) {
        UserEntity user = requireUser(userId, "账号不存在");
        String rawPwd = gen.gen6();
        um.update(null, new LambdaUpdateWrapper<UserEntity>()
                .eq(UserEntity::getId, userId)
                .set(UserEntity::getPassword, pe.encode(rawPwd))
                .set(UserEntity::getMustChangePassword, 1)
                .set(UserEntity::getFailedLoginAttempts, 0)
                .set(UserEntity::getLockedUntil, null));
        boolean mailSent = mail.sendPasswordReset(user.getEmail(), Objects.requireNonNullElse(user.getName(), "用户"), user.getEmail(), rawPwd);
        return Map.of("ok", true, "mailSent", mailSent, "tempPassword", rawPwd);
    }

    /**
     * 创建并组装当前业务对象或执行一段创建型流程。
     * 阅读这个方法时，可以重点关注它读取了哪些输入、修改了哪些状态，以及异常或边界条件如何处理。
     */
    private Long createTeacherAccount(Long schoolId, String email, String name, Long departmentId, Long majorId) {
        if (um.selectOne(new LambdaQueryWrapper<UserEntity>().eq(UserEntity::getEmail, email)) != null) {
            throw new BusinessException("EMAIL_EXISTS", "邮箱已存在：" + email);
        }
        String raw = gen.gen6();
        UserEntity user = new UserEntity();
        user.setEmail(email);
        user.setName(name);
        user.setRole("TEACHER");
        user.setPassword(pe.encode(raw));
        user.setEnabled(1);
        user.setMustChangePassword(1);
        user.setFailedLoginAttempts(0);
        um.insert(user);
        TeacherEntity teacher = new TeacherEntity();
        teacher.setUserId(user.getId());
        teacher.setSchoolId(schoolId);
        teacher.setDepartmentId(departmentId);
        teacher.setMajorId(majorId);
        tp.insert(teacher);
        mail.sendAccount(email, name, email, raw);
        return user.getId();
    }

    /**
     * 创建并组装当前业务对象或执行一段创建型流程。
     * 阅读这个方法时，可以重点关注它读取了哪些输入、修改了哪些状态，以及异常或边界条件如何处理。
     */
    private Long createStudentAccount(Long schoolId, String email, String name, Long departmentId, Long majorId, String photoFileName, byte[] photoBytes) throws Exception {
        if (um.selectOne(new LambdaQueryWrapper<UserEntity>().eq(UserEntity::getEmail, email)) != null) {
            throw new BusinessException("EMAIL_EXISTS", "邮箱已存在：" + email);
        }
        if (photoBytes == null || photoBytes.length == 0) {
            throw new BusinessException("BAD_REQUEST", "缺少照片文件：" + photoFileName);
        }
        String raw = gen.gen6();
        UserEntity user = new UserEntity();
        user.setEmail(email);
        user.setName(name);
        user.setRole("STUDENT");
        user.setPassword(pe.encode(raw));
        user.setEnabled(1);
        user.setMustChangePassword(1);
        user.setFailedLoginAttempts(0);
        um.insert(user);
        String mime = guessImageMime(photoFileName);
        var f = face.extract(mime, photoBytes);
        StudentEntity student = new StudentEntity();
        student.setUserId(user.getId());
        student.setSchoolId(schoolId);
        student.setDepartmentId(departmentId);
        student.setMajorId(majorId);
        student.setFacePhoto(photoBytes);
        student.setFacePhotoMime(f.getMime());
        student.setFacePhotoSha256(f.getSha256());
        student.setFaceEmbeddingJson(f.getJson());
        student.setFaceEmbeddingDim((short) f.getDim());
        student.setFaceDetScore(java.math.BigDecimal.valueOf(f.getScore()));
        sp.insert(student);
        mail.sendAccount(email, name, email, raw);
        return user.getId();
    }

    /**
     * 执行前置校验或条件判断，为后续主流程提供可靠分支依据。
     * 阅读这个方法时，可以重点关注它读取了哪些输入、修改了哪些状态，以及异常或边界条件如何处理。
     */
    private DepartmentEntity requireDepartmentByName(Long schoolId, String departmentName) {
        String name = requireName(departmentName, "学院名称不能为空");
        DepartmentEntity department = dm.selectOne(new LambdaQueryWrapper<DepartmentEntity>()
                .eq(DepartmentEntity::getSchoolId, schoolId)
                .eq(DepartmentEntity::getName, name)
                .last("limit 1"));
        if (department == null) {
            throw new BusinessException("NOT_FOUND", "学院不存在：" + name);
        }
        return department;
    }

    /**
     * 执行前置校验或条件判断，为后续主流程提供可靠分支依据。
     * 阅读这个方法时，可以重点关注它读取了哪些输入、修改了哪些状态，以及异常或边界条件如何处理。
     */
    private MajorEntity requireMajorByName(Long schoolId, Long departmentId, String majorName) {
        String name = requireName(majorName, "专业名称不能为空");
        MajorEntity major = mm.selectOne(new LambdaQueryWrapper<MajorEntity>()
                .eq(MajorEntity::getDepartmentId, departmentId)
                .eq(MajorEntity::getName, name)
                .last("limit 1"));
        if (major == null) {
            throw new BusinessException("NOT_FOUND", "专业不存在：" + name);
        }
        requireMajor(schoolId, major.getId());
        return major;
    }

    /**
     * 封装当前类中的一段独立业务步骤，减少调用方直接处理过多细节。
     * 阅读这个方法时，可以重点关注它读取了哪些输入、修改了哪些状态，以及异常或边界条件如何处理。
     */
    private byte[] resolvePhotoBytes(BulkImportSupportService.ZipBundle bundle, String photoFileName) {
        String name = trimToNull(photoFileName);
        if (name == null) {
            throw new BusinessException("BAD_REQUEST", "students.csv 中 photoFile 不能为空");
        }
        byte[] bytes = bundle.get(name);
        if (bytes != null) {
            return bytes;
        }
        return bundle.entries().entrySet().stream()
                .filter(entry -> entry.getKey().endsWith("/" + name) || entry.getKey().equals(name))
                .map(Map.Entry::getValue)
                .findFirst()
                .orElseThrow(() -> new BusinessException("BAD_REQUEST", "压缩包中未找到照片文件：" + name));
    }

    /**
     * 封装当前类中的一段独立业务步骤，减少调用方直接处理过多细节。
     * 阅读这个方法时，可以重点关注它读取了哪些输入、修改了哪些状态，以及异常或边界条件如何处理。
     */
    private String guessImageMime(String fileName) {
        String lower = fileName == null ? "" : fileName.toLowerCase(Locale.ROOT);
        if (lower.endsWith(".png")) {
            return "image/png";
        }
        if (lower.endsWith(".webp")) {
            return "image/webp";
        }
        return "image/jpeg";
    }

    /**
     * 封装当前类中的一段独立业务步骤，减少调用方直接处理过多细节。
     * 阅读这个方法时，可以重点关注它读取了哪些输入、修改了哪些状态，以及异常或边界条件如何处理。
     */
    private String csv(Object value) {
        String text = value == null ? "" : String.valueOf(value).replace("\"", "\"\"");
        return "\"" + text + "\"";
    }

    /**
     * 执行前置校验或条件判断，为后续主流程提供可靠分支依据。
     * 阅读这个方法时，可以重点关注它读取了哪些输入、修改了哪些状态，以及异常或边界条件如何处理。
     */
    private boolean hasText(String value) {
        return value != null && !value.trim().isEmpty();
    }

    /**
     * 执行前置校验或条件判断，为后续主流程提供可靠分支依据。
     * 阅读这个方法时，可以重点关注它读取了哪些输入、修改了哪些状态，以及异常或边界条件如何处理。
     */
    private String requireName(String value, String message) {
        String text = trimToNull(value);
        if (text == null) {
            throw new BusinessException("BAD_REQUEST", message);
        }
        return text;
    }

    private String requireEmail(String value) {
        String text = trimToNull(value);
        if (text == null) {
            throw new BusinessException("BAD_REQUEST", "邮箱不能为空");
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
}
