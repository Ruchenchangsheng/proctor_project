package com.kovr.proctor.infra.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.kovr.proctor.domain.entity.StudentEntity;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.util.List;
import java.util.Map;

@Mapper
public interface StudentMapper extends BaseMapper<StudentEntity> {

//  学校管理员查看学生列表
    @Select({
            "<script>",
            "select s.user_id as id, u.name as name, u.email as email,",
            "       u.enabled as enabled,",
            "       d.name as departmentName, m.name as majorName,",
            "       date_format(u.created_at, '%Y-%m-%d %H:%i:%s') as createdAt",
            "from students s",
            "join users u on u.id = s.user_id",
            "left join departments d on d.id = s.department_id",
            "left join majors m on m.id = s.major_id",
            "where s.school_id = #{schoolId}",
            "<if test='departmentId != null'> and s.department_id = #{departmentId} </if>",
            "<if test='majorId != null'> and s.major_id = #{majorId} </if>",
            "<if test='keyword != null and keyword != \"\"'>",
            "  and (u.name like concat('%', #{keyword}, '%') or u.email like concat('%', #{keyword}, '%'))",
            "</if>",
            "order by s.user_id desc",
            "</script>"
    })
    List<Map<String,Object>> selectStudentsBySchool(
            @Param("schoolId") Long schoolId,
            @Param("departmentId") Long departmentId,
            @Param("majorId") Long majorId,
            @Param("keyword") String keyword);

    // 在你现有的 StudentMapper 接口内新增：
    @Select({
            "select",
            "  u.id as id, u.name as name, u.email as email,",
            "  sch.name as schoolName,",
            "  d.name as departmentName,",
            "  m.name as majorName",
            "from students s",
            "join users u on u.id = s.user_id",
            "join schools sch on sch.id = s.school_id",
            "left join departments d on d.id = s.department_id",
            "left join majors m on m.id = s.major_id",
            "where s.user_id = #{userId}"
    })
    Map<String,Object> selectStudentProfileByUserId(@Param("userId") Long userId);

    @Select({
            "<script>",
            "select s.user_id",
            "from students s",
            "join users u on u.id = s.user_id",
            "where s.school_id = #{schoolId}",
            "  and u.enabled = 1",
            "<if test='departmentId != null'> and s.department_id = #{departmentId} </if>",
            "<if test='majorId != null'> and s.major_id = #{majorId} </if>",
            "order by s.user_id asc",
            "</script>"
    })
    List<Long> selectStudentIdsByScope(
            @Param("schoolId") Long schoolId,
            @Param("departmentId") Long departmentId,
            @Param("majorId") Long majorId);

    @Select({
            "<script>",
            "select s.user_id",
            "from students s",
            "join users u on u.id = s.user_id",
            "where s.school_id = #{schoolId}",
            "  and s.department_id = #{departmentId}",
            "  and s.major_id = #{majorId}",
            "  and u.enabled = 1",
            "  and u.email in",
            "  <foreach item='email' collection='emails' open='(' separator=',' close=')'>",
            "    #{email}",
            "  </foreach>",
            "order by s.user_id asc",
            "</script>"
    })
    List<Long> selectStudentIdsByEmails(
            @Param("schoolId") Long schoolId,
            @Param("departmentId") Long departmentId,
            @Param("majorId") Long majorId,
            @Param("emails") List<String> emails);

    @Select({
            "<script>",
            "select s.user_id as id, 'STUDENT' as role,",
            "       s.school_id as schoolId, sch.name as schoolName,",
            "       u.name as name, u.email as email, u.enabled as enabled,",
            "       d.name as departmentName, m.name as majorName,",
            "       date_format(u.created_at, '%Y-%m-%d %H:%i:%s') as createdAt",
            "from students s",
            "join users u on u.id = s.user_id",
            "join schools sch on sch.id = s.school_id",
            "left join departments d on d.id = s.department_id",
            "left join majors m on m.id = s.major_id",
            "<where>",
            "  <if test='schoolId != null'> and s.school_id = #{schoolId} </if>",
            "  <if test='enabled != null'> and u.enabled = #{enabled} </if>",
            "  <if test='keyword != null and keyword != \"\"'>",
            "    and (u.name like concat('%', #{keyword}, '%') or u.email like concat('%', #{keyword}, '%'))",
            "  </if>",
            "</where>",
            "order by s.user_id desc",
            "</script>"
    })
    List<Map<String, Object>> selectStudentsForAdmin(
            @Param("schoolId") Long schoolId,
            @Param("keyword") String keyword,
            @Param("enabled") Integer enabled);

    @Select("select user_id from students where school_id = #{schoolId}")
    List<Long> selectStudentUserIdsBySchool(@Param("schoolId") Long schoolId);

    @Select("""
            select count(1)
            from exam_sessions s
            join exams e on e.id = s.exam_id
            where s.student_id = #{studentUserId}
              and (e.end_at is null or e.end_at >= now())
            """)
    long countActiveSessions(@Param("studentUserId") Long studentUserId);
}
