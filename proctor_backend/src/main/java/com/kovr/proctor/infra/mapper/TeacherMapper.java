package com.kovr.proctor.infra.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.kovr.proctor.domain.entity.TeacherEntity;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.util.List;
import java.util.Map;
/**
 * TeacherMapper 定义对应实体的数据库访问方法，供服务层查询和更新数据。
 */

@Mapper
public interface TeacherMapper extends BaseMapper<TeacherEntity> {
    @Select({
            "<script>",
            "select t.user_id as id, u.name as name, u.email as email,",
            "       u.enabled as enabled,",
            "       d.name as departmentName, m.name as majorName,",
            "       date_format(u.created_at, '%Y-%m-%d %H:%i:%s') as createdAt",
            "from teachers t",
            "join users u on u.id = t.user_id",
            "left join departments d on d.id = t.department_id",
            "left join majors m on m.id = t.major_id",
            "where t.school_id = #{schoolId}",
            "<if test='departmentId != null'> and t.department_id = #{departmentId} </if>",
            "<if test='majorId != null'> and t.major_id = #{majorId} </if>",
            "<if test='keyword != null and keyword != \"\"'>",
            "  and (u.name like concat('%', #{keyword}, '%') or u.email like concat('%', #{keyword}, '%'))",
            "</if>",
            "order by t.user_id desc",
            "</script>"
    })
    List<Map<String,Object>> selectTeachersBySchool(
            @Param("schoolId") Long schoolId,
            @Param("departmentId") Long departmentId,
            @Param("majorId") Long majorId,
            @Param("keyword") String keyword);

    @Select({
            "<script>",
            "select t.user_id",
            "from teachers t",
            "join users u on u.id = t.user_id",
            "where t.school_id = #{schoolId}",
            "  and u.enabled = 1",
            "<if test='departmentId != null'> and t.department_id = #{departmentId} </if>",
            "<if test='majorId != null'> and t.major_id = #{majorId} </if>",
            "order by t.user_id asc",
            "</script>"
    })
    List<Long> selectTeacherIdsByScope(
            @Param("schoolId") Long schoolId,
            @Param("departmentId") Long departmentId,
            @Param("majorId") Long majorId);

    @Select({
            "<script>",
            "select t.user_id as id, 'TEACHER' as role,",
            "       t.school_id as schoolId, s.name as schoolName,",
            "       u.name as name, u.email as email, u.enabled as enabled,",
            "       d.name as departmentName, m.name as majorName,",
            "       date_format(u.created_at, '%Y-%m-%d %H:%i:%s') as createdAt",
            "from teachers t",
            "join users u on u.id = t.user_id",
            "join schools s on s.id = t.school_id",
            "left join departments d on d.id = t.department_id",
            "left join majors m on m.id = t.major_id",
            "<where>",
            "  <if test='schoolId != null'> and t.school_id = #{schoolId} </if>",
            "  <if test='enabled != null'> and u.enabled = #{enabled} </if>",
            "  <if test='keyword != null and keyword != \"\"'>",
            "    and (u.name like concat('%', #{keyword}, '%') or u.email like concat('%', #{keyword}, '%'))",
            "  </if>",
            "</where>",
            "order by t.user_id desc",
            "</script>"
    })
    List<Map<String, Object>> selectTeachersForAdmin(
            @Param("schoolId") Long schoolId,
            @Param("keyword") String keyword,
            @Param("enabled") Integer enabled);

    @Select("select user_id from teachers where school_id = #{schoolId}")
    List<Long> selectTeacherUserIdsBySchool(@Param("schoolId") Long schoolId);

    @Select("""
            select count(1)
            from exam_rooms er
            join exams e on e.id = er.exam_id
            where er.invigilator_id = #{teacherUserId}
              and (e.end_at is null or e.end_at >= now())
            """)
    long countActiveAssignments(@Param("teacherUserId") Long teacherUserId);
}
