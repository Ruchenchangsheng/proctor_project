package com.kovr.proctor.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.kovr.proctor.api.dto.CreateExamReq;
import com.kovr.proctor.common.BusinessException;
import com.kovr.proctor.domain.entity.*;
import com.kovr.proctor.infra.mapper.*;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;

@Service
@RequiredArgsConstructor
public class ExamService {
    private final ExamMapper examMapper;
    private final ExamTeacherMapper examTeacherMapper;
    private final ExamStudentMapper examStudentMapper;
    private final TeacherMapper teacherMapper;
    private final StudentMapper studentMapper;
    private final SchoolAdminMapper schoolAdminMapper;

    public List<Map<String, Object>> listExamsBySchool(Long schoolId, Long schoolAdminUserId) {
        assertSchoolAdminOwnsSchool(schoolId, schoolAdminUserId);
        return examMapper.selectBySchoolId(schoolId);
    }

    public List<Map<String, Object>> listExamsByTeacher(Long teacherUserId) {
        return examMapper.selectByTeacherId(teacherUserId);
    }

    public List<Map<String, Object>> listExamsByStudent(Long studentUserId) {
        return examMapper.selectByStudentId(studentUserId);
    }

    @Transactional
    public Map<String, Object> createExam(Long schoolId, Long creatorUserId, CreateExamReq req) {
        assertSchoolAdminOwnsSchool(schoolId, creatorUserId);
        if (!req.endAt().isAfter(req.startAt())) {
            throw new BusinessException("INVALID_TIME_RANGE", "考试结束时间必须晚于开始时间");
        }

        Set<Long> teacherIds = new LinkedHashSet<>(req.teacherIds());
        Set<Long> studentIds = new LinkedHashSet<>(req.studentIds());
        if (teacherIds.isEmpty()) throw new BusinessException("EMPTY_TEACHERS", "至少分配一位监考老师");
        if (studentIds.isEmpty()) throw new BusinessException("EMPTY_STUDENTS", "至少分配一位学生");

        // 校验老师都属于当前学校
        long validTeachers = teacherMapper.selectCount(
                new LambdaQueryWrapper<TeacherEntity>()
                        .eq(TeacherEntity::getSchoolId, schoolId)
                        .in(TeacherEntity::getUserId, teacherIds)
        );
        if (validTeachers != teacherIds.size()) {
            throw new BusinessException("TEACHER_NOT_IN_SCHOOL", "存在不属于当前学校的监考老师");
        }

        // 校验学生都属于当前学校
        long validStudents = studentMapper.selectCount(
                new LambdaQueryWrapper<StudentEntity>()
                        .eq(StudentEntity::getSchoolId, schoolId)
                        .in(StudentEntity::getUserId, studentIds)
        );
        if (validStudents != studentIds.size()) {
            throw new BusinessException("STUDENT_NOT_IN_SCHOOL", "存在不属于当前学校的学生");
        }

        // 创建考试
        ExamEntity exam = new ExamEntity();
        exam.setSchoolId(schoolId);
        exam.setName(req.name());
        exam.setRoomCode(req.roomCode());
        exam.setStartAt(req.startAt());
        exam.setEndAt(req.endAt());
        exam.setStatus("CREATED");
        exam.setCreatedBy(creatorUserId);
        examMapper.insert(exam);

        // 关联监考老师
        for (Long teacherId : teacherIds) {
            ExamTeacherEntity et = new ExamTeacherEntity();
            et.setExamId(exam.getId());
            et.setTeacherId(teacherId);
            examTeacherMapper.insert(et);
        }

        // 关联学生
        for (Long studentId : studentIds) {
            ExamStudentEntity es = new ExamStudentEntity();
            es.setExamId(exam.getId());
            es.setStudentId(studentId);
            examStudentMapper.insert(es);
        }

        Map<String, Object> res = new LinkedHashMap<>();
        res.put("examId", exam.getId());
        res.put("roomCode", exam.getRoomCode());
        res.put("teacherCount", teacherIds.size());
        res.put("studentCount", studentIds.size());
        res.put("status", exam.getStatus());
        return res;
    }

    private void assertSchoolAdminOwnsSchool(Long schoolId, Long schoolAdminUserId) {
        SchoolAdminEntity profile = schoolAdminMapper.selectById(schoolAdminUserId);
        if (profile == null || !Objects.equals(profile.getSchoolId(), schoolId)) {
            throw new BusinessException("SCHOOL_SCOPE_DENIED", "无权在该学校范围内创建或查看考试");
        }
    }

}
