package com.kovr.proctor.infra.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.kovr.proctor.domain.entity.TeacherEntity;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.util.List;
import java.util.Map;

@Mapper
public interface TeacherMapper extends BaseMapper<TeacherEntity> {
    @Select({
            "<script>",
            "select t.user_id as id, u.name as name, u.email as email,",
            "       d.name as departmentName, m.name as majorName,",
            "       date_format(u.created_at, '%Y-%m-%d %H:%i:%s') as createdAt",
            "from teachers t",
            "join users u on u.id = t.user_id",
            "left join departments d on d.id = t.department_id",
            "left join majors m on m.id = t.major_id",
            "where t.school_id = #{schoolId}",
            "<if test='departmentId != null'> and t.department_id = #{departmentId} </if>",
            "<if test='majorId != null'> and t.major_id = #{majorId} </if>",
            "order by t.user_id desc",
            "</script>"
    })
    List<Map<String,Object>> selectTeachersBySchool(
            @Param("schoolId") Long schoolId,
            @Param("departmentId") Long departmentId,
            @Param("majorId") Long majorId);
}
