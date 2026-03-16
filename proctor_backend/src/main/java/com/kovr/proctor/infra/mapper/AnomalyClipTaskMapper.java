package com.kovr.proctor.infra.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.kovr.proctor.domain.entity.AnomalyClipTaskEntity;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.util.List;

@Mapper
public interface AnomalyClipTaskMapper extends BaseMapper<AnomalyClipTaskEntity> {
    @Select("select * from anomaly_clip_tasks where task_id = #{taskId} limit 1")
    AnomalyClipTaskEntity selectByTaskId(@Param("taskId") String taskId);

    @Select("select * from anomaly_clip_tasks where status = 'PENDING' order by id asc limit #{limit}")
    List<AnomalyClipTaskEntity> selectPending(@Param("limit") int limit);
}
