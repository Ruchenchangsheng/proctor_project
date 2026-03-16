package com.kovr.proctor.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.kovr.proctor.api.dto.CreateExamReq;
import com.kovr.proctor.api.dto.UpdateExamReq;
import com.kovr.proctor.common.BusinessException;
import com.kovr.proctor.domain.entity.AnomalyClipTaskEntity;
import com.kovr.proctor.domain.entity.ExamEntity;
import com.kovr.proctor.domain.entity.ExamRoomEnrollmentEntity;
import com.kovr.proctor.domain.entity.ExamRoomEntity;
import com.kovr.proctor.domain.entity.ExamSessionEntity;
import com.kovr.proctor.infra.mapper.AnomalyClipTaskMapper;
import com.kovr.proctor.infra.mapper.AnomalyEvidenceMapper;
import com.kovr.proctor.infra.mapper.AnomalySegmentLinkMapper;
import com.kovr.proctor.infra.mapper.ExamMapper;
import com.kovr.proctor.infra.mapper.ExamRoomEnrollmentMapper;
import com.kovr.proctor.infra.mapper.ExamRoomMapper;
import com.kovr.proctor.infra.mapper.ExamSessionMapper;
import com.kovr.proctor.infra.mapper.RecordingSegmentMapper;
import com.kovr.proctor.infra.mapper.StudentMapper;
import com.kovr.proctor.infra.mapper.TeacherMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

@Service
@RequiredArgsConstructor
public class ExamArrangeService {
    private final ExamMapper examMapper;
    private final ExamRoomMapper examRoomMapper;
    private final ExamRoomEnrollmentMapper enrollmentMapper;
    private final ExamSessionMapper sessionMapper;
    private final StudentMapper studentMapper;
    private final TeacherMapper teacherMapper;
    private final RecordingSegmentMapper recordingSegmentMapper;
    private final AnomalyEvidenceMapper anomalyEvidenceMapper;
    private final AnomalyClipTaskMapper anomalyClipTaskMapper;
    private final AnomalySegmentLinkMapper anomalySegmentLinkMapper;

    public List<Map<String, Object>> listExams(Long schoolId, Long departmentId, Long majorId, String keyword, String status) {
        return examMapper.selectExamsByScope(schoolId, departmentId, majorId, normalizeKeyword(keyword), normalizeStatus(status));
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

        List<Long> studentIds = loadStudentIdsForExam(schoolId, req);
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

    @Transactional
    public Map<String, Object> updateExam(Long schoolId, Long examId, UpdateExamReq req) {
        ExamEntity exam = examMapper.selectById(examId);
        if (exam == null || !Objects.equals(exam.getSchoolId(), schoolId)) {
            throw new BusinessException("NOT_FOUND", "考试不存在");
        }
        if (!isExamPending(exam)) {
            throw new BusinessException("EXAM_UPDATE_FORBIDDEN", "仅未开始的考试允许修改");
        }
        validateUpdateReq(req);

        exam.setName(req.name().trim());
        exam.setStartAt(req.startAt());
        exam.setEndAt(req.endAt());
        examMapper.updateById(exam);

        return Map.of(
                "examId", exam.getId(),
                "name", exam.getName(),
                "startAt", exam.getStartAt(),
                "endAt", exam.getEndAt()
        );
    }

    @Transactional
    public void deleteExam(Long schoolId, Long examId) {
        ExamEntity exam = examMapper.selectById(examId);
        if (exam == null || !Objects.equals(exam.getSchoolId(), schoolId)) {
            throw new BusinessException("NOT_FOUND", "考试不存在");
        }
        if (isExamRunning(exam)) {
            throw new BusinessException("EXAM_DELETE_FORBIDDEN", "进行中的考试不允许删除");
        }

        List<ExamSessionEntity> sessions = sessionMapper.selectList(
                new LambdaQueryWrapper<ExamSessionEntity>().eq(ExamSessionEntity::getExamId, examId));
        List<Long> sessionIds = sessions.stream().map(ExamSessionEntity::getId).filter(Objects::nonNull).toList();

        List<AnomalyClipTaskEntity> clipTasks = anomalyClipTaskMapper.selectList(
                new LambdaQueryWrapper<AnomalyClipTaskEntity>().eq(AnomalyClipTaskEntity::getExamId, examId));
        List<String> taskIds = clipTasks.stream().map(AnomalyClipTaskEntity::getTaskId).filter(Objects::nonNull).toList();
        if (!taskIds.isEmpty()) {
            anomalySegmentLinkMapper.delete(new LambdaQueryWrapper<com.kovr.proctor.domain.entity.AnomalySegmentLinkEntity>()
                    .in(com.kovr.proctor.domain.entity.AnomalySegmentLinkEntity::getTaskId, taskIds));
        }
        anomalyClipTaskMapper.delete(new LambdaQueryWrapper<AnomalyClipTaskEntity>().eq(AnomalyClipTaskEntity::getExamId, examId));
        anomalyEvidenceMapper.delete(new LambdaQueryWrapper<com.kovr.proctor.domain.entity.AnomalyEvidenceEntity>()
                .eq(com.kovr.proctor.domain.entity.AnomalyEvidenceEntity::getExamId, examId));
        if (!sessionIds.isEmpty()) {
            recordingSegmentMapper.delete(new LambdaQueryWrapper<com.kovr.proctor.domain.entity.RecordingSegmentEntity>()
                    .in(com.kovr.proctor.domain.entity.RecordingSegmentEntity::getSessionId, sessionIds));
        }

        List<ExamRoomEntity> rooms = examRoomMapper.selectList(
                new LambdaQueryWrapper<ExamRoomEntity>().eq(ExamRoomEntity::getExamId, examId));
        List<Long> roomIds = rooms.stream().map(ExamRoomEntity::getId).filter(Objects::nonNull).toList();
        if (!roomIds.isEmpty()) {
            enrollmentMapper.delete(new LambdaQueryWrapper<ExamRoomEnrollmentEntity>()
                    .in(ExamRoomEnrollmentEntity::getExamRoomId, roomIds));
        }
        sessionMapper.delete(new LambdaQueryWrapper<ExamSessionEntity>().eq(ExamSessionEntity::getExamId, examId));
        examRoomMapper.delete(new LambdaQueryWrapper<ExamRoomEntity>().eq(ExamRoomEntity::getExamId, examId));
        examMapper.deleteById(examId);
    }

    private void validateReq(CreateExamReq req) {
        if (req == null || req.name() == null || req.name().isBlank()) {
            throw new BusinessException("BAD_REQUEST", "考试名称不能为空");
        }
        if (req.departmentId() == null || req.majorId() == null) {
            throw new BusinessException("BAD_REQUEST", "学院和专业不能为空");
        }
        if (req.startAt() != null && req.endAt() != null && req.endAt().isBefore(req.startAt())) {
            throw new BusinessException("BAD_REQUEST", "考试结束时间不能早于开始时间");
        }
    }

    private List<Long> loadStudentIdsForExam(Long schoolId, CreateExamReq req) {
        List<String> emails = req.studentEmails() == null ? List.of() : req.studentEmails().stream()
                .filter(item -> item != null && !item.isBlank())
                .map(String::trim)
                .distinct()
                .toList();
        if (emails.isEmpty()) {
            return studentMapper.selectStudentIdsByScope(schoolId, req.departmentId(), req.majorId());
        }
        List<Long> studentIds = studentMapper.selectStudentIdsByEmails(schoolId, req.departmentId(), req.majorId(), emails);
        if (studentIds.size() != emails.size()) {
            throw new BusinessException("STUDENT_SCOPE_MISMATCH", "导入名单中存在未找到、已冻结或不属于当前学院专业的学生");
        }
        return studentIds;
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

    private void validateUpdateReq(UpdateExamReq req) {
        if (req == null || req.name() == null || req.name().isBlank()) {
            throw new BusinessException("BAD_REQUEST", "考试名称不能为空");
        }
        if (req.startAt() != null && req.endAt() != null && req.endAt().isBefore(req.startAt())) {
            throw new BusinessException("BAD_REQUEST", "考试结束时间不能早于开始时间");
        }
    }

    private boolean isExamPending(ExamEntity exam) {
        return !isExamRunning(exam) && !isExamFinished(exam);
    }

    private boolean isExamRunning(ExamEntity exam) {
        if (exam == null || exam.getStartAt() == null) {
            return false;
        }
        var now = java.time.LocalDateTime.now();
        boolean started = !exam.getStartAt().isAfter(now);
        boolean notEnded = exam.getEndAt() == null || !exam.getEndAt().isBefore(now);
        return started && notEnded;
    }

    private boolean isExamFinished(ExamEntity exam) {
        return exam != null && exam.getEndAt() != null && exam.getEndAt().isBefore(java.time.LocalDateTime.now());
    }

    private String normalizeKeyword(String keyword) {
        if (keyword == null) {
            return null;
        }
        String value = keyword.trim();
        return value.isEmpty() ? null : value;
    }

    private String normalizeStatus(String status) {
        if (status == null) {
            return null;
        }
        String value = status.trim();
        return value.isEmpty() ? null : value;
    }
}
