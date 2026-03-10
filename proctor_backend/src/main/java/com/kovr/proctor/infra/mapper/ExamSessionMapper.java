package com.kovr.proctor.infra.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.kovr.proctor.domain.entity.ExamSessionEntity;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.util.List;
import java.util.Map;

@Mapper
public interface ExamSessionMapper extends BaseMapper<ExamSessionEntity> {

    @Select({
            "select s.id as sessionId, s.exam_id as examId, s.exam_room_id as examRoomId,",
            "       e.name as examName, er.room_id as roomId,",
            "       date_format(e.start_at, '%Y-%m-%d %H:%i:%s') as startAt,",
            "       date_format(e.end_at, '%Y-%m-%d %H:%i:%s') as endAt",
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
            "select s.id as sessionId, s.status as sessionStatus, s.exam_room_id as examRoomId,",
            "       e.id as examId, e.name as examName, er.room_id as roomId,",
            "       date_format(e.start_at, '%Y-%m-%d %H:%i:%s') as startAt,",
            "       date_format(e.end_at, '%Y-%m-%d %H:%i:%s') as endAt,",
            "       case",
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

    @Select({
            "select s.id as sessionId, s.exam_id as examId, s.exam_room_id as examRoomId,",
            "       e.name as examName, er.room_id as roomId,",
            "       date_format(e.start_at, '%Y-%m-%d %H:%i:%s') as startAt,",
            "       date_format(e.end_at, '%Y-%m-%d %H:%i:%s') as endAt",
            "from exam_sessions s",
            "join exams e on e.id = s.exam_id",
            "join exam_rooms er on er.id = s.exam_room_id",
            "where s.id = #{sessionId} and s.student_id = #{studentId}",
            "limit 1"
    })
    Map<String, Object> selectSessionRoomByStudentAndSessionId(
            @Param("studentId") Long studentId,
            @Param("sessionId") Long sessionId);
}
