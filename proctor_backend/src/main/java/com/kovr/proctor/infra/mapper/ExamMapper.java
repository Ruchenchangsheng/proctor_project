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
            "       m.name as majorName",
            "from exams e",
            "left join departments d on d.id = e.department_id",
            "left join majors m on m.id = e.major_id",
            "where e.school_id = #{schoolId}",
            "<if test='departmentId != null'> and e.department_id = #{departmentId} </if>",
            "<if test='majorId != null'> and e.major_id = #{majorId} </if>",
            "order by e.id desc",
            "</script>"
    })
    List<Map<String, Object>> selectExamsByScope(
            @Param("schoolId") Long schoolId,
            @Param("departmentId") Long departmentId,
            @Param("majorId") Long majorId);
}
