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
            "       d.name as departmentName, m.name as majorName,",
            "       date_format(u.created_at, '%Y-%m-%d %H:%i:%s') as createdAt",
            "from students s",
            "join users u on u.id = s.user_id",
            "left join departments d on d.id = s.department_id",
            "left join majors m on m.id = s.major_id",
            "where s.school_id = #{schoolId}",
            "<if test='departmentId != null'> and s.department_id = #{departmentId} </if>",
            "<if test='majorId != null'> and s.major_id = #{majorId} </if>",
            "order by s.user_id desc",
            "</script>"
    })
    List<Map<String,Object>> selectStudentsBySchool(
            @Param("schoolId") Long schoolId,
            @Param("departmentId") Long departmentId,
            @Param("majorId") Long majorId);

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
}
