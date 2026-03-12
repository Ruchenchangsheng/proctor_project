package com.kovr.proctor.infra.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.kovr.proctor.domain.entity.ExamRoomEntity;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.util.List;
import java.util.Map;

@Mapper
public interface ExamRoomMapper extends BaseMapper<ExamRoomEntity> {
    @Select({
            "select er.id as examRoomId, er.room_id as roomId, er.invigilator_id as invigilatorId,",
            "       u.name as invigilatorName, er.capacity as capacity,",
            "       count(ere.id) as studentCount",
            "from exam_rooms er",
            "left join users u on u.id = er.invigilator_id",
            "left join exam_room_enrollments ere on ere.exam_room_id = er.id",
            "where er.exam_id = #{examId}",
            "group by er.id, er.room_id, er.invigilator_id, u.name, er.capacity",
            "order by er.room_id asc"
    })
    List<Map<String, Object>> selectRoomsByExamId(@Param("examId") Long examId);

    @Select({
            "select e.student_id as studentId, u.name as studentName, u.email as studentEmail",
            "from exam_room_enrollments e",
            "join users u on u.id = e.student_id",
            "where e.exam_room_id = #{examRoomId}",
            "order by e.student_id asc"
    })
    List<Map<String, Object>> selectStudentsByRoomId(@Param("examRoomId") Long examRoomId);

    @Select({
            "<script>",
            "select er.id as examRoomId, er.room_id as roomId, er.capacity,",
            "       e.id as examId, e.name as examName,",
            "       date_format(e.start_at, '%Y-%m-%d %H:%i:%s') as startAt,",
            "       date_format(e.end_at, '%Y-%m-%d %H:%i:%s') as endAt,",
            "       d.name as departmentName, m.name as majorName,",
            "       count(ere.id) as studentCount,",
            "       case",
            "         when e.end_at is not null and e.end_at &lt; now() then 'COMPLETED'",
            "         when e.start_at is not null and e.start_at &lt;= now() and (e.end_at is null or e.end_at &gt;= now()) then 'RUNNING'",
            "         else 'PENDING'",
            "       end as phase",
            "from exam_rooms er",
            "join exams e on e.id = er.exam_id",
            "left join departments d on d.id = e.department_id",
            "left join majors m on m.id = e.major_id",
            "left join exam_room_enrollments ere on ere.exam_room_id = er.id",
            "where er.invigilator_id = #{teacherUserId}",
            "<if test='phase != null and phase != \"\"'>",
            "  and (",
            "     (#{phase} = 'COMPLETED' and e.end_at is not null and e.end_at &lt; now())",
            "  or (#{phase} = 'RUNNING' and e.start_at is not null and e.start_at &lt;= now() and (e.end_at is null or e.end_at &gt;= now()))",
            "  or (#{phase} = 'PENDING' and not (e.start_at is not null and e.start_at &lt;= now() and (e.end_at is null or e.end_at &gt;= now())) and not (e.end_at is not null and e.end_at &lt; now()))",
            "  )",
            "</if>",
            "group by er.id, er.room_id, er.capacity, e.id, e.name, e.start_at, e.end_at, d.name, m.name",
            "order by",
            "  case",
            "    when e.start_at is null then 1",
            "    else 0",
            "  end asc,",
            "  e.start_at asc, e.id desc",
            "</script>"
    })
    List<Map<String, Object>> selectInvigilationsByTeacher(
            @Param("teacherUserId") Long teacherUserId,
            @Param("phase") String phase);

    @Select({
            "select er.id as examRoomId, er.room_id as roomId, e.id as examId, e.name as examName, e.school_id as schoolId, date_format(e.start_at, '%Y-%m-%d %H:%i:%s') as startAt, date_format(e.end_at, '%Y-%m-%d %H:%i:%s') as endAt",
            "from exam_rooms er",
            "join exams e on e.id = er.exam_id",
            "where er.id = #{examRoomId} and er.invigilator_id = #{teacherUserId}",
            "limit 1"
    })
    Map<String, Object> selectOwnedRoomByTeacher(
            @Param("examRoomId") Long examRoomId,
            @Param("teacherUserId") Long teacherUserId);
}
