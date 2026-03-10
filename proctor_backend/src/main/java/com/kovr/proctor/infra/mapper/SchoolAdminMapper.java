package com.kovr.proctor.infra.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.kovr.proctor.domain.entity.SchoolAdminEntity;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface SchoolAdminMapper extends BaseMapper<SchoolAdminEntity> {
}
