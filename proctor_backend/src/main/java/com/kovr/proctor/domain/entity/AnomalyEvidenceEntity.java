package com.kovr.proctor.domain.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;
/**
 * AnomalyEvidenceEntity 对应数据库中的一类持久化记录，字段基本都会直接映射到表列或查询结果。
 * 字段说明：
 * - id: 当前记录在对应数据表中的主键标识。
 * - evidenceId: 该字段承载当前对象的一项业务属性，阅读时可以结合它所在类和数据库表一起理解。
 * - examRoomId: 关联监考房间/考场主键，实时监考和证据检索都会用到它。
 * - studentId: 关联学生的业务主键或账号主键，方便把考试数据回溯到具体学生。
 * - schoolId: 该记录所属学校的主键，很多跨学校查询都会以它作为过滤条件。
 * - examId: 关联考试主键，表示这条记录归属于哪一场考试。
 * - sessionId: 关联考试会话主键，表示某个学生参与某场考试的独立会话。
 * - examName: 展示给用户看的名称字段，具体含义取决于所在对象，例如学校名、考试名或人员姓名。
 * - roomId: 该字段承载当前对象的一项业务属性，阅读时可以结合它所在类和数据库表一起理解。
 * - studentName: 展示给用户看的名称字段，具体含义取决于所在对象，例如学校名、考试名或人员姓名。
 * - invigilatorName: 展示给用户看的名称字段，具体含义取决于所在对象，例如学校名、考试名或人员姓名。
 * - anomalyLabel: 异常标签、分类名或模板标识，用来说明当前记录具体属于哪一类。
 * - severity: 异常严重程度，通常用于前端标签展示和审核优先级排序。
 * - anomalyAt: 该字段承载当前对象的一项业务属性，阅读时可以结合它所在类和数据库表一起理解。
 * - anomalyTsMs: 异常主时间点（毫秒），常被作为证据命名、排序和定位依据。
 * - filePath: 媒体或文件在服务器磁盘上的绝对路径，用于后续读取和下载。
 * - mediaType: 当前记录的类型字段，帮助调用方区分不同子场景或不同事件类别。
 * - mediaExt: 媒体文件扩展名，主要用于下载命名和前端展示。
 * - frameCount: 当前证据最终包含的帧数或分片数，可用于判断证据完整度。
 * - reviewStatus: 当前业务状态字段，例如考试状态、审核状态或任务状态。
 * - reviewNote: 审核备注，记录人工审查时留下的判断说明。
 * - reviewedByUserId: 关联到 users 表的账号主键，用来把业务档案和登录账号绑定起来。
 * - reviewedByName: 展示给用户看的名称字段，具体含义取决于所在对象，例如学校名、考试名或人员姓名。
 * - reviewedAt: 证据或记录被人工审核完成的时间。
 * - lastViewedAt: 该字段承载当前对象的一项业务属性，阅读时可以结合它所在类和数据库表一起理解。
 * - createdAt: 记录创建时间，方便审计和排序。
 */

@Data
@TableName("anomaly_evidences")
public class AnomalyEvidenceEntity {
    @TableId(type = IdType.AUTO)
    private Long id;
    private String evidenceId;
    private Long examRoomId;
    private Long studentId;
    private Long schoolId;
    private Long examId;
    private Long sessionId;
    private String examName;
    private String roomId;
    private String studentName;
    private String invigilatorName;
    private String anomalyLabel;
    private String severity;
    private LocalDateTime anomalyAt;
    private Long anomalyTsMs;
    private String filePath;
    private String mediaType;
    private String mediaExt;
    private Integer frameCount;
    private String reviewStatus;
    private String reviewNote;
    private Long reviewedByUserId;
    private String reviewedByName;
    private LocalDateTime reviewedAt;
    private LocalDateTime lastViewedAt;
    private LocalDateTime createdAt;
}
