package com.kovr.proctor.infra.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.kovr.proctor.domain.entity.ExamEntity;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.util.List;
import java.util.Map;

@Mapper
public interface ExamMapper extends BaseMapper<ExamEntity> {

    @Select({
            "select e.id, e.name, e.room_code as roomCode, e.start_at as startAt, e.end_at as endAt, e.status",
            "from exams e",
            "where e.school_id = #{schoolId}",
            "order by e.start_at desc"
    })
    List<Map<String, Object>> selectBySchoolId(@Param("schoolId") Long schoolId);

    @Select({
            "select e.id, e.name, e.room_code as roomCode, e.start_at as startAt, e.end_at as endAt, e.status",
            "from exams e",
            "join exam_teachers et on et.exam_id = e.id",
            "where et.teacher_id = #{teacherId}",
            "order by e.start_at desc"
    })
    List<Map<String, Object>> selectByTeacherId(@Param("teacherId") Long teacherId);

    @Select({
            "select e.id, e.name, e.room_code as roomCode, e.start_at as startAt, e.end_at as endAt, e.status",
            "from exams e",
            "join exam_students es on es.exam_id = e.id",
            "where es.student_id = #{studentId}",
            "order by e.start_at desc"
    })
    List<Map<String, Object>> selectByStudentId(@Param("studentId") Long studentId);
}
