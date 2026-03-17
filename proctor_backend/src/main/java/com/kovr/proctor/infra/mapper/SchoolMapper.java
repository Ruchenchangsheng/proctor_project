package com.kovr.proctor.infra.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.kovr.proctor.domain.entity.SchoolEntity;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.util.List;
import java.util.Map;
/**
 * SchoolMapper 定义对应实体的数据库访问方法，供服务层查询和更新数据。
 */

@Mapper
public interface SchoolMapper extends BaseMapper<SchoolEntity> {
    @Select("""
            SELECT s.id, s.name,
                   u.name AS adminName, u.email AS adminEmail
            FROM schools s
            LEFT JOIN school_admin sap ON sap.school_id = s.id
            LEFT JOIN users u ON u.id = sap.user_id
            ORDER BY s.id DESC
            """)
    List<Map<String, Object>> selectSchoolsWithAdmins();

    @Select({
            "<script>",
            "select s.id, s.name, s.domain,",
            "       sap.user_id as adminUserId,",
            "       u.name as adminName,",
            "       u.email as adminEmail,",
            "       coalesce(u.enabled, 0) as adminEnabled,",
            "       (select count(1) from departments d where d.school_id = s.id) as departmentCount,",
            "       (select count(1) from majors m join departments d2 on d2.id = m.department_id where d2.school_id = s.id) as majorCount,",
            "       (select count(1) from teachers t where t.school_id = s.id) as teacherCount,",
            "       (select count(1) from students st where st.school_id = s.id) as studentCount,",
            "       (select count(1) from exams e where e.school_id = s.id) as examCount,",
            "       (select count(1) from exams e where e.school_id = s.id and e.start_at is not null and e.start_at &lt;= now() and (e.end_at is null or e.end_at &gt;= now())) as runningExamCount,",
            "       (select count(1) from anomaly_evidences ae where ae.school_id = s.id) as evidenceCount",
            "from schools s",
            "left join school_admin sap on sap.school_id = s.id",
            "left join users u on u.id = sap.user_id",
            "<where>",
            "  <if test='keyword != null and keyword != \"\"'>",
            "    (s.name like concat('%', #{keyword}, '%') or u.name like concat('%', #{keyword}, '%') or u.email like concat('%', #{keyword}, '%'))",
            "  </if>",
            "  <if test='enabled != null'>",
            "    and coalesce(u.enabled, 0) = #{enabled}",
            "  </if>",
            "</where>",
            "order by s.id desc",
            "</script>"
    })
    List<Map<String, Object>> selectPlatformSchools(
            @Param("keyword") String keyword,
            @Param("enabled") Integer enabled);
}
