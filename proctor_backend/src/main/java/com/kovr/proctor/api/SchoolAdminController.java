package com.kovr.proctor.api;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.kovr.proctor.api.dto.CreateDeptReq;
import com.kovr.proctor.api.dto.CreateExamReq;
import com.kovr.proctor.api.dto.CreateMajorReq;
import com.kovr.proctor.api.dto.CreateTeacherReq;
import com.kovr.proctor.domain.entity.*;
import com.kovr.proctor.infra.mapper.*;
import com.kovr.proctor.security.UserDetailsImpl;
import com.kovr.proctor.service.FaceClient;
import com.kovr.proctor.service.ExamArrangeService;
import com.kovr.proctor.service.MailService;
import com.kovr.proctor.util.PasswordGen;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;
import java.util.Map;

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
    private final PasswordGen gen;
    private final PasswordEncoder pe;
    private final MailService mail;
    private final FaceClient face;
    private final TeacherMapper teacherMapper;
    private final StudentMapper studentMapper;
    private final ExamArrangeService examArrangeService;

    @GetMapping("/my")
    @PreAuthorize("hasRole('SCHOOL_ADMIN')")
    public SchoolEntity mySchool(@AuthenticationPrincipal UserDetailsImpl u) {
        var p = sap.selectById(u.getId());
        return p == null ? null : sm.selectById(p.getSchoolId());
    }

    @GetMapping("/{schoolId}/departments")
    @PreAuthorize("hasRole('SCHOOL_ADMIN')")
    public List<DepartmentEntity> listDepts(@PathVariable Long schoolId) {
        return dm.selectList(new LambdaQueryWrapper<DepartmentEntity>().eq(DepartmentEntity::getSchoolId, schoolId));
    }

    @GetMapping("/{schoolId}/majors")
    @PreAuthorize("hasRole('SCHOOL_ADMIN')")
    public List<MajorEntity> listMajors(@PathVariable Long schoolId, @RequestParam Long departmentId) {
        return mm.selectList(new LambdaQueryWrapper<MajorEntity>().eq(MajorEntity::getDepartmentId, departmentId));
    }

    @GetMapping("/{schoolId}/teachers")
    @PreAuthorize("hasRole('SCHOOL_ADMIN')")
    public List<Map<String, Object>> listTeachers(
            @PathVariable Long schoolId,
            @RequestParam(required = false) Long departmentId,
            @RequestParam(required = false) Long majorId) {
        return teacherMapper.selectTeachersBySchool(schoolId, departmentId, majorId);
    }

    @GetMapping("/{schoolId}/students")
    @PreAuthorize("hasRole('SCHOOL_ADMIN')")
    public List<Map<String, Object>> listStudents(
            @PathVariable Long schoolId,
            @RequestParam(required = false) Long departmentId,
            @RequestParam(required = false) Long majorId) {
        return studentMapper.selectStudentsBySchool(schoolId, departmentId, majorId);
    }

    @PostMapping("/{schoolId}/departments")
    @PreAuthorize("hasRole('SCHOOL_ADMIN')")
    public Map<String, Object> createDept(@PathVariable Long schoolId, @RequestBody CreateDeptReq req) {
        var d = new DepartmentEntity();
        d.setSchoolId(schoolId);
        d.setName(req.name());
        dm.insert(d);
        return Map.of("departmentId", d.getId());
    }

    @PostMapping("/{schoolId}/majors")
    @PreAuthorize("hasRole('SCHOOL_ADMIN')")
    public Map<String, Object> createMajor(@PathVariable Long schoolId, @RequestBody CreateMajorReq req) {
        var m = new MajorEntity();
        m.setDepartmentId(req.departmentId());
        m.setName(req.name());
        mm.insert(m);
        return Map.of("majorId", m.getId());
    }

    @PostMapping("/{schoolId}/teachers")
    @PreAuthorize("hasRole('SCHOOL_ADMIN')")
    @Transactional
    public Map<String, Object> createTeacher(@PathVariable Long schoolId, @RequestBody CreateTeacherReq req) {
        String raw = gen.gen6();
        var u = new UserEntity();
        u.setEmail(req.email());
        u.setName(req.name());
        u.setRole("TEACHER");
        u.setPassword(pe.encode(raw));
        u.setEnabled(1);
        um.insert(u);
        var p = new TeacherEntity();
        p.setUserId(u.getId());
        p.setSchoolId(schoolId);
        p.setDepartmentId(req.departmentId());
        p.setMajorId(req.majorId());
        tp.insert(p);
        mail.sendAccount(req.email(), req.name(), req.email(), raw);
        return Map.of("userId", u.getId());
    }

    @PostMapping(value = "/{schoolId}/students", consumes = "multipart/form-data")
    @PreAuthorize("hasRole('SCHOOL_ADMIN')")
    @Transactional
    public Map<String, Object> createStudent(@PathVariable Long schoolId, @RequestParam String email, @RequestParam String name, @RequestParam Long departmentId, @RequestParam(required = false) Long majorId, @RequestPart("photo") MultipartFile photo) throws Exception {
        String raw = gen.gen6();
        var u = new UserEntity();
        u.setEmail(email);
        u.setName(name);
        u.setRole("STUDENT");
        u.setPassword(pe.encode(raw));
        u.setEnabled(1);
        um.insert(u);
        byte[] bytes = photo.getBytes();
        String mime = photo.getContentType();
        var f = face.extract(mime, bytes);
        var p = new StudentEntity();
        p.setUserId(u.getId());
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
        return Map.of("userId", u.getId());
    }

    @PostMapping("/{schoolId}/exams")
    @PreAuthorize("hasRole('SCHOOL_ADMIN')")
    public Map<String, Object> createExam(
            @PathVariable Long schoolId,
            @AuthenticationPrincipal UserDetailsImpl u,
            @RequestBody CreateExamReq req) {
        return examArrangeService.createExam(schoolId, u.getId(), req);
    }

    @GetMapping("/{schoolId}/exams")
    @PreAuthorize("hasRole('SCHOOL_ADMIN')")
    public List<Map<String, Object>> listExams(
            @PathVariable Long schoolId,
            @RequestParam(required = false) Long departmentId,
            @RequestParam(required = false) Long majorId) {
        return examArrangeService.listExams(schoolId, departmentId, majorId);
    }

    @GetMapping("/{schoolId}/exams/{examId}/rooms")
    @PreAuthorize("hasRole('SCHOOL_ADMIN')")
    public List<Map<String, Object>> listExamRooms(
            @PathVariable Long schoolId,
            @PathVariable Long examId) {
        return examArrangeService.listExamRooms(examId);
    }
}
