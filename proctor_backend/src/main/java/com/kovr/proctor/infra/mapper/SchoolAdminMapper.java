package com.kovr.proctor.infra.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.kovr.proctor.domain.entity.SchoolAdminEntity;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.util.List;
import java.util.Map;

@Mapper
public interface SchoolAdminMapper extends BaseMapper<SchoolAdminEntity> {
    @Select({
            "<script>",
            "select sap.user_id as userId, sap.school_id as schoolId,",
            "       s.name as schoolName, s.domain as schoolDomain,",
            "       u.name as adminName, u.email as adminEmail, u.enabled as enabled,",
            "       date_format(u.created_at, '%Y-%m-%d %H:%i:%s') as createdAt",
            "from school_admin sap",
            "join schools s on s.id = sap.school_id",
            "join users u on u.id = sap.user_id",
            "<where>",
            "  <if test='schoolId != null'> and sap.school_id = #{schoolId} </if>",
            "  <if test='enabled != null'> and u.enabled = #{enabled} </if>",
            "  <if test='keyword != null and keyword != \"\"'>",
            "    and (s.name like concat('%', #{keyword}, '%') or u.name like concat('%', #{keyword}, '%') or u.email like concat('%', #{keyword}, '%'))",
            "  </if>",
            "</where>",
            "order by sap.user_id desc",
            "</script>"
    })
    List<Map<String, Object>> selectPlatformAdmins(
            @Param("schoolId") Long schoolId,
            @Param("keyword") String keyword,
            @Param("enabled") Integer enabled);

    @Select("select user_id from school_admin where school_id = #{schoolId} limit 1")
    Long selectAdminUserIdBySchoolId(@Param("schoolId") Long schoolId);
}
