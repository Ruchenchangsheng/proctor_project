package com.kovr.proctor.service;

import com.kovr.proctor.api.dto.CreateExamReq;
import com.kovr.proctor.common.BusinessException;
import com.kovr.proctor.domain.entity.ExamEntity;
import com.kovr.proctor.domain.entity.ExamRoomEnrollmentEntity;
import com.kovr.proctor.domain.entity.ExamRoomEntity;
import com.kovr.proctor.domain.entity.ExamSessionEntity;
import com.kovr.proctor.infra.mapper.ExamMapper;
import com.kovr.proctor.infra.mapper.ExamRoomEnrollmentMapper;
import com.kovr.proctor.infra.mapper.ExamRoomMapper;
import com.kovr.proctor.infra.mapper.ExamSessionMapper;
import com.kovr.proctor.infra.mapper.StudentMapper;
import com.kovr.proctor.infra.mapper.TeacherMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
@RequiredArgsConstructor
public class ExamArrangeService {
    private final ExamMapper examMapper;
    private final ExamRoomMapper examRoomMapper;
    private final ExamRoomEnrollmentMapper enrollmentMapper;
    private final ExamSessionMapper sessionMapper;
    private final StudentMapper studentMapper;
    private final TeacherMapper teacherMapper;

    public List<Map<String, Object>> listExams(Long schoolId, Long departmentId, Long majorId) {
        return examMapper.selectExamsByScope(schoolId, departmentId, majorId);
    }

    public List<Map<String, Object>> listExamRooms(Long examId) {
        List<Map<String, Object>> rooms = examRoomMapper.selectRoomsByExamId(examId);
        for (Map<String, Object> room : rooms) {
            Object roomId = room.get("examRoomId");
            if (roomId instanceof Number id) {
                room.put("students", examRoomMapper.selectStudentsByRoomId(id.longValue()));
            }
        }
        return rooms;
    }

    @Transactional
    public Map<String, Object> createExam(Long schoolId, Long creatorId, CreateExamReq req) {
        validateReq(req);

        List<Long> studentIds = studentMapper.selectStudentIdsByScope(schoolId, req.departmentId(), req.majorId());
        if (studentIds == null || studentIds.isEmpty()) {
            throw new BusinessException("NO_STUDENTS", "当前筛选范围内没有考生，无法创建考试");
        }

        int roomCapacity = calculateRoomCapacity(req);
        int requiredRooms = (studentIds.size() + roomCapacity - 1) / roomCapacity;

        List<Long> invigilatorIds = teacherMapper.selectTeacherIdsByScope(schoolId, req.departmentId(), req.majorId());
        if (invigilatorIds == null || invigilatorIds.size() < requiredRooms) {
            throw new BusinessException("INVIGILATOR_NOT_ENOUGH",
                    "可用监考老师数量不足，至少需要 " + requiredRooms + " 名老师，当前仅有 "
                            + (invigilatorIds == null ? 0 : invigilatorIds.size()) + " 名");
        }

        ExamEntity exam = new ExamEntity();
        exam.setSchoolId(schoolId);
        exam.setDepartmentId(req.departmentId());
        exam.setMajorId(req.majorId());
        exam.setName(req.name().trim());
        exam.setStartAt(req.startAt());
        exam.setEndAt(req.endAt());
        exam.setCreatedBy(creatorId);
        examMapper.insert(exam);

        List<Map<String, Object>> roomResults = new ArrayList<>();
        for (int i = 0; i < requiredRooms; i++) {
            ExamRoomEntity room = new ExamRoomEntity();
            room.setExamId(exam.getId());
            room.setRoomId("ROOM-" + (i + 1));
            room.setInvigilatorId(invigilatorIds.get(i));
            room.setCapacity(roomCapacity);
            examRoomMapper.insert(room);

            int start = i * roomCapacity;
            int end = Math.min(start + roomCapacity, studentIds.size());
            List<Long> currentStudents = studentIds.subList(start, end);
            for (Long studentId : currentStudents) {
                ExamRoomEnrollmentEntity enrollment = new ExamRoomEnrollmentEntity();
                enrollment.setExamRoomId(room.getId());
                enrollment.setStudentId(studentId);
                enrollmentMapper.insert(enrollment);

                ExamSessionEntity session = new ExamSessionEntity();
                session.setExamId(exam.getId());
                session.setSchoolId(schoolId);
                session.setDepartmentId(req.departmentId());
                session.setMajorId(req.majorId());
                session.setExamRoomId(room.getId());
                session.setInvigilatorId(room.getInvigilatorId());
                session.setStudentId(studentId);
                session.setStatus("NOT_STARTED");
                sessionMapper.insert(session);
            }

            Map<String, Object> roomInfo = new LinkedHashMap<>();
            roomInfo.put("roomId", room.getRoomId());
            roomInfo.put("examRoomId", room.getId());
            roomInfo.put("invigilatorId", room.getInvigilatorId());
            roomInfo.put("capacity", roomCapacity);
            roomInfo.put("studentCount", currentStudents.size());
            roomInfo.put("studentIds", currentStudents);
            roomResults.add(roomInfo);
        }

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("examId", exam.getId());
        result.put("examName", exam.getName());
        result.put("studentCount", studentIds.size());
        result.put("roomCapacity", roomCapacity);
        result.put("roomCount", requiredRooms);
        result.put("rooms", roomResults);
        return result;
    }

    private void validateReq(CreateExamReq req) {
        if (req == null || req.name() == null || req.name().isBlank()) {
            throw new BusinessException("BAD_REQUEST", "考试名称不能为空");
        }
        if (req.startAt() != null && req.endAt() != null && req.endAt().isBefore(req.startAt())) {
            throw new BusinessException("BAD_REQUEST", "考试结束时间不能早于开始时间");
        }
    }

    private int calculateRoomCapacity(CreateExamReq req) {
        int width = req.invigilatorScreenWidth() == null ? 1920 : req.invigilatorScreenWidth();
        int height = req.invigilatorScreenHeight() == null ? 1080 : req.invigilatorScreenHeight();
        int minTileWidth = req.minStudentTileWidth() == null ? 320 : req.minStudentTileWidth();
        int minTileHeight = req.minStudentTileHeight() == null ? 240 : req.minStudentTileHeight();

        if (width <= 0 || height <= 0 || minTileWidth <= 0 || minTileHeight <= 0) {
            throw new BusinessException("BAD_REQUEST", "屏幕尺寸与最小视频窗尺寸必须大于 0");
        }

        int columns = Math.max(1, width / minTileWidth);
        int rows = Math.max(1, height / minTileHeight);
        int byScreen = Math.max(1, columns * rows);

        Integer hardCap = req.hardCapPerRoom();
        if (hardCap != null && hardCap > 0) {
            return Math.min(byScreen, hardCap);
        }
        return byScreen;
    }
}