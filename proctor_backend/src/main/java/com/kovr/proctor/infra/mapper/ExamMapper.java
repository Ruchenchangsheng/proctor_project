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
            "<script>",
            "select e.id, e.name,",
            "       date_format(e.start_at, '%Y-%m-%d %H:%i:%s') as startAt,",
            "       date_format(e.end_at, '%Y-%m-%d %H:%i:%s') as endAt,",
            "       d.name as departmentName,",
            "       m.name as majorName,",
            "       case",
            "         when e.end_at is not null and e.end_at &lt; now() then 'FINISHED'",
            "         when e.start_at is not null and e.start_at &lt;= now() and (e.end_at is null or e.end_at &gt;= now()) then 'RUNNING'",
            "         else 'NOT_STARTED'",
            "       end as status",
            "from exams e",
            "left join departments d on d.id = e.department_id",
            "left join majors m on m.id = e.major_id",
            "where e.school_id = #{schoolId}",
            "<if test='departmentId != null'> and e.department_id = #{departmentId} </if>",
            "<if test='majorId != null'> and e.major_id = #{majorId} </if>",
            "<if test='keyword != null and keyword != \"\"'> and e.name like concat('%', #{keyword}, '%') </if>",
            "<if test='status != null and status != \"\"'>",
            "  and (",
            "     (#{status} = 'FINISHED' and e.end_at is not null and e.end_at &lt; now())",
            "  or (#{status} = 'RUNNING' and e.start_at is not null and e.start_at &lt;= now() and (e.end_at is null or e.end_at &gt;= now()))",
            "  or (#{status} = 'NOT_STARTED' and not (e.start_at is not null and e.start_at &lt;= now() and (e.end_at is null or e.end_at &gt;= now())) and not (e.end_at is not null and e.end_at &lt; now()))",
            "  )",
            "</if>",
            "order by e.id desc",
            "</script>"
    })
    List<Map<String, Object>> selectExamsByScope(
            @Param("schoolId") Long schoolId,
            @Param("departmentId") Long departmentId,
            @Param("majorId") Long majorId,
            @Param("keyword") String keyword,
            @Param("status") String status);

    @Select({
            "<script>",
            "select e.id, e.school_id as schoolId, s.name as schoolName, e.name,",
            "       date_format(e.start_at, '%Y-%m-%d %H:%i:%s') as startAt,",
            "       date_format(e.end_at, '%Y-%m-%d %H:%i:%s') as endAt,",
            "       d.name as departmentName,",
            "       m.name as majorName,",
            "       case",
            "         when e.end_at is not null and e.end_at &lt; now() then 'FINISHED'",
            "         when e.start_at is not null and e.start_at &lt;= now() and (e.end_at is null or e.end_at &gt;= now()) then 'RUNNING'",
            "         else 'NOT_STARTED'",
            "       end as status,",
            "       (select count(1) from exam_rooms er where er.exam_id = e.id) as roomCount,",
            "       (select count(1) from exam_room_enrollments ere join exam_rooms er2 on er2.id = ere.exam_room_id where er2.exam_id = e.id) as studentCount,",
            "       (select count(1) from anomaly_evidences ae where ae.exam_id = e.id) as evidenceCount",
            "from exams e",
            "join schools s on s.id = e.school_id",
            "left join departments d on d.id = e.department_id",
            "left join majors m on m.id = e.major_id",
            "<where>",
            "  <if test='schoolId != null'> and e.school_id = #{schoolId} </if>",
            "  <if test='keyword != null and keyword != \"\"'> and e.name like concat('%', #{keyword}, '%') </if>",
            "  <if test='status != null and status != \"\"'>",
            "    and (",
            "      (#{status} = 'FINISHED' and e.end_at is not null and e.end_at &lt; now())",
            "      or (#{status} = 'RUNNING' and e.start_at is not null and e.start_at &lt;= now() and (e.end_at is null or e.end_at &gt;= now()))",
            "      or (#{status} = 'NOT_STARTED' and not (e.start_at is not null and e.start_at &lt;= now() and (e.end_at is null or e.end_at &gt;= now())) and not (e.end_at is not null and e.end_at &lt; now()))",
            "    )",
            "  </if>",
            "</where>",
            "order by e.id desc",
            "</script>"
    })
    List<Map<String, Object>> selectExamsForAdmin(
            @Param("schoolId") Long schoolId,
            @Param("keyword") String keyword,
            @Param("status") String status);
}
