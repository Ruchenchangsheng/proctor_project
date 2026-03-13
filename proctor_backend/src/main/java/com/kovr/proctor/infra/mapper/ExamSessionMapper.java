package com.kovr.proctor.infra.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.kovr.proctor.domain.entity.ExamSessionEntity;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

import java.util.List;
import java.util.Map;

@Mapper
public interface ExamSessionMapper extends BaseMapper<ExamSessionEntity> {

    @Select({
            "select s.id as sessionId, s.status as sessionStatus, s.exam_id as examId, s.exam_room_id as examRoomId, e.name as examName, er.room_id as roomId, date_format(e.start_at, '%Y-%m-%d %H:%i:%s') as startAt, date_format(e.end_at, '%Y-%m-%d %H:%i:%s') as endAt",
            "from exam_sessions s",
            "join exams e on e.id = s.exam_id",
            "join exam_rooms er on er.id = s.exam_room_id",
            "where s.student_id = #{studentId}",
            "order by",
            "  case",
            "    when e.start_at is not null and e.start_at <= now() and (e.end_at is null or e.end_at >= now()) then 0",
            "    when e.end_at is not null and e.end_at < now() then 2",
            "    else 1",
            "  end asc,",
            "  e.start_at asc",
            "limit 1"
    })
    Map<String, Object> selectCurrentSessionByStudentId(@Param("studentId") Long studentId);

    @Select({
            "select s.id as sessionId, s.status as sessionStatus, s.exam_room_id as examRoomId, e.id as examId, e.name as examName, er.room_id as roomId,",
            "       date_format(e.start_at, '%Y-%m-%d %H:%i:%s') as startAt, date_format(e.end_at, '%Y-%m-%d %H:%i:%s') as endAt,",
            "       date_format(s.entered_at, '%Y-%m-%d %H:%i:%s') as enteredAt, date_format(s.finished_at, '%Y-%m-%d %H:%i:%s') as finishedAt,",
            "       case when s.status = 'FINISHED' then 'COMPLETED' else 'NOT_PARTICIPATED' end as participationStatus,",
            "       case",
            "         when s.status = 'CANCELLED' then 'TERMINATED'",
            "         when s.status = 'FINISHED' then 'COMPLETED'",
            "         when e.end_at is not null and e.end_at < now() then 'COMPLETED'",
            "         when e.start_at is not null and e.start_at <= now() and (e.end_at is null or e.end_at >= now()) then 'RUNNING'",
            "         else 'PENDING'",
            "       end as phase",
            "from exam_sessions s",
            "join exams e on e.id = s.exam_id",
            "left join exam_rooms er on er.id = s.exam_room_id",
            "where s.student_id = #{studentId}",
            "order by e.start_at asc, s.id asc"
    })
    List<Map<String, Object>> selectSessionsByStudentId(@Param("studentId") Long studentId);

    @Select("""
            select s.id as sessionId,
                   s.status as sessionStatus,
                   s.exam_id as examId,
                   s.school_id as schoolId,
                   s.exam_room_id as examRoomId,
                   e.name as examName,
                   er.room_id as roomId,
                   date_format(e.start_at, '%Y-%m-%d %H:%i:%s') as startAt,
                   date_format(e.end_at, '%Y-%m-%d %H:%i:%s') as endAt
            from exam_sessions s
            join exams e on e.id = s.exam_id
            join exam_rooms er on er.id = s.exam_room_id
            where s.id = #{sessionId}
              and s.student_id = #{studentId}
            limit 1
            """)
    Map<String, Object> selectSessionRoomByStudentAndSessionId(
            @Param("studentId") Long studentId,
            @Param("sessionId") Long sessionId);

    @Update({
            "update exam_sessions",
            "set status = 'RUNNING', entered_at = coalesce(entered_at, now())",
            "where id = #{sessionId} and (status is null or status = 'NOT_STARTED' or status = 'RUNNING')"
    })
    int markSessionEnteredWithTimestamp(@Param("sessionId") Long sessionId);

//    default int markSessionEntered(Long sessionId) {
//        return markSessionEnteredWithTimestamp(sessionId);
//    }

    @Update({
            "update exam_sessions",
            "set status = 'RUNNING'",
            "where id = #{sessionId} and (status is null or status = 'NOT_STARTED' or status = 'RUNNING')"
    })
    int markSessionEnteredWithoutTimestamp(@Param("sessionId") Long sessionId);

    @Update({
            "update exam_sessions",
            "set status = 'FINISHED', finished_at = now()",
            "where id = #{sessionId} and (status is null or status not in ('FINISHED','CANCELLED'))"
    })
    int finishSessionWithTimestamp(@Param("sessionId") Long sessionId);

    @Update({
            "update exam_sessions",
            "set status = 'FINISHED'",
            "where id = #{sessionId} and (status is null or status not in ('FINISHED','CANCELLED'))"
    })
    int finishSessionWithoutTimestamp(@Param("sessionId") Long sessionId);

    @Update({
            "update exam_sessions",
            "set status = 'CANCELLED', finished_at = now()",
            "where id = #{sessionId} and (status is null or status not in ('FINISHED','CANCELLED'))"
    })
    int cancelSessionWithTimestamp(@Param("sessionId") Long sessionId);

    @Update({
            "update exam_sessions",
            "set status = 'CANCELLED'",
            "where id = #{sessionId} and (status is null or status not in ('FINISHED','CANCELLED'))"
    })
    int cancelSessionWithoutTimestamp(@Param("sessionId") Long sessionId);

    @Update({
            "update exam_sessions",
            "set status = status",
            "where id = #{sessionId}"
    })
    int markAbnormalExit(@Param("sessionId") Long sessionId);
}