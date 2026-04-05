package com.kovr.proctor.infra.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.kovr.proctor.domain.entity.RecordingSegmentEntity;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.util.List;
/**
 * RecordingSegmentMapper 定义对应实体的数据库访问方法，供服务层查询和更新数据。
 */

@Mapper
public interface RecordingSegmentMapper extends BaseMapper<RecordingSegmentEntity> {
    @Select("""
            select * from recording_segments
            where segment_id = #{segmentId}
            limit 1
            """)
    RecordingSegmentEntity selectBySegmentId(@Param("segmentId") String segmentId);

    @Select("""
            select * from recording_segments
            where exam_room_id = #{examRoomId}
              and student_id = #{studentId}
              and chunk_end_ts_ms >= #{fromTs}
              and chunk_start_ts_ms <= #{toTs}
            order by chunk_start_ts_ms asc
            """)
    List<RecordingSegmentEntity> selectByWindow(@Param("examRoomId") Long examRoomId,
                                                @Param("studentId") Long studentId,
                                                @Param("fromTs") long fromTs,
                                                @Param("toTs") long toTs);

    @Select("""
            select * from recording_segments
            where session_id = #{sessionId}
              and student_id = #{studentId}
            order by chunk_start_ts_ms asc
            """)
    List<RecordingSegmentEntity> selectBySession(@Param("sessionId") Long sessionId,
                                                 @Param("studentId") Long studentId);
}
