package com.kovr.proctor.infra.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.kovr.proctor.domain.entity.AnomalySegmentLinkEntity;
import org.apache.ibatis.annotations.Mapper;
/**
 * AnomalySegmentLinkMapper 定义对应实体的数据库访问方法，供服务层查询和更新数据。
 */

@Mapper
public interface AnomalySegmentLinkMapper extends BaseMapper<AnomalySegmentLinkEntity> {}
