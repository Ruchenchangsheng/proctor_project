package com.kovr.proctor.domain.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;
/**
 * RecordingSegmentEntity 对应数据库中的一类持久化记录，字段基本都会直接映射到表列或查询结果。
 * 字段说明：
 * - id: 当前记录在对应数据表中的主键标识。
 * - segmentId: 该字段承载当前对象的一项业务属性，阅读时可以结合它所在类和数据库表一起理解。
 * - sessionId: 关联考试会话主键，表示某个学生参与某场考试的独立会话。
 * - examRoomId: 关联监考房间/考场主键，实时监考和证据检索都会用到它。
 * - studentId: 关联学生的业务主键或账号主键，方便把考试数据回溯到具体学生。
 * - schoolId: 该记录所属学校的主键，很多跨学校查询都会以它作为过滤条件。
 * - chunkStartTsMs: 视频分片开始时间戳（毫秒），用于证据窗口检索。
 * - chunkEndTsMs: 视频分片结束时间戳（毫秒），用于判断异常后的尾部视频是否齐全。
 * - filePath: 媒体或文件在服务器磁盘上的绝对路径，用于后续读取和下载。
 * - mediaType: 当前记录的类型字段，帮助调用方区分不同子场景或不同事件类别。
 * - createdAt: 记录创建时间，方便审计和排序。
 */

@Data
@TableName("recording_segments")
public class RecordingSegmentEntity {
    @TableId(type = IdType.AUTO)
    private Long id;
    private String segmentId;
    private Long sessionId;
    private Long examRoomId;
    private Long studentId;
    private Long schoolId;
    private Long chunkStartTsMs;
    private Long chunkEndTsMs;
    private String filePath;
    private String mediaType;
    private LocalDateTime createdAt;
}
