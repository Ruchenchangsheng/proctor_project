package com.kovr.proctor.domain.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;
/**
 * AnomalyClipTaskEntity 对应数据库中的一类持久化记录，字段基本都会直接映射到表列或查询结果。
 * 字段说明：
 * - id: 当前记录在对应数据表中的主键标识。
 * - taskId: 该字段承载当前对象的一项业务属性，阅读时可以结合它所在类和数据库表一起理解。
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
 * - anomalyTsMs: 异常主时间点（毫秒），常被作为证据命名、排序和定位依据。
 * - anomalyStartTsMs: 异常区间开始时间（毫秒），方便给证据补上前置上下文。
 * - anomalyEndTsMs: 异常区间结束时间（毫秒），方便给证据补上后置上下文。
 * - status: 当前业务状态字段，例如考试状态、审核状态或任务状态。
 * - evidenceId: 该字段承载当前对象的一项业务属性，阅读时可以结合它所在类和数据库表一起理解。
 * - errorMsg: 该字段承载当前对象的一项业务属性，阅读时可以结合它所在类和数据库表一起理解。
 * - createdAt: 记录创建时间，方便审计和排序。
 * - updatedAt: 记录最后更新时间，方便判断最近一次变更。
 */

@Data
@TableName("anomaly_clip_tasks")
public class AnomalyClipTaskEntity {
    @TableId(type = IdType.AUTO)
    private Long id;
    private String taskId;
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
    private Long anomalyTsMs;
    private Long anomalyStartTsMs;
    private Long anomalyEndTsMs;
    private String status;
    private String evidenceId;
    private String errorMsg;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
