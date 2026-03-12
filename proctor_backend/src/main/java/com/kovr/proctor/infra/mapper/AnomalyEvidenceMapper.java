package com.kovr.proctor.infra.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.kovr.proctor.domain.entity.AnomalyEvidenceEntity;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.util.List;

@Mapper
public interface AnomalyEvidenceMapper extends BaseMapper<AnomalyEvidenceEntity> {
    @Select("select * from anomaly_evidences where exam_room_id = #{examRoomId} order by anomaly_ts_ms desc")
    List<AnomalyEvidenceEntity> selectByRoom(@Param("examRoomId") Long examRoomId);

    @Select("select * from anomaly_evidences where school_id = #{schoolId} order by anomaly_ts_ms desc")
    List<AnomalyEvidenceEntity> selectBySchool(@Param("schoolId") Long schoolId);

    @Select("select * from anomaly_evidences order by anomaly_ts_ms desc")
    List<AnomalyEvidenceEntity> selectAllOrdered();

    @Select("select * from anomaly_evidences where evidence_id = #{evidenceId} limit 1")
    AnomalyEvidenceEntity selectByEvidenceId(@Param("evidenceId") String evidenceId);
}
