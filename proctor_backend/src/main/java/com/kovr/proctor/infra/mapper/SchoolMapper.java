package com.kovr.proctor.infra.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.kovr.proctor.domain.entity.SchoolEntity;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Select;

import java.util.List;
import java.util.Map;

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
}
