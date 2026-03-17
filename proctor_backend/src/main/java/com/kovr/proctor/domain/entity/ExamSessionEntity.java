package com.kovr.proctor.domain.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;
/**
 * ExamSessionEntity 对应数据库中的一类持久化记录，字段基本都会直接映射到表列或查询结果。
 * 字段说明：
 * - id: 当前记录在对应数据表中的主键标识。
 * - examId: 关联考试主键，表示这条记录归属于哪一场考试。
 * - schoolId: 该记录所属学校的主键，很多跨学校查询都会以它作为过滤条件。
 * - departmentId: 所属院系主键，用来约束教师、学生或考试的组织范围。
 * - majorId: 所属专业主键，细化到院系下的专业维度。
 * - examRoomId: 关联监考房间/考场主键，实时监考和证据检索都会用到它。
 * - invigilatorId: 监考教师主键，用来定位当前场次由哪位教师负责。
 * - studentId: 关联学生的业务主键或账号主键，方便把考试数据回溯到具体学生。
 * - status: 当前业务状态字段，例如考试状态、审核状态或任务状态。
 * - lastVerifyScore: 评分或相似度结果，常用于人脸核验、异常强度或检测置信度。
 * - lastVerifyAt: 该字段承载当前对象的一项业务属性，阅读时可以结合它所在类和数据库表一起理解。
 * - enteredAt: 学生真正进入考试或资源的时间点，用来区分计划时间和实际进入时间。
 * - finishedAt: 考试、任务或审核真正完成的时间点。
 */

@Data
@TableName("exam_sessions")
public class ExamSessionEntity {
    @TableId(type = IdType.AUTO)
    private Long id;
    private Long examId;
    private Long schoolId;
    private Long departmentId;
    private Long majorId;
    private Long examRoomId;
    private Long invigilatorId;
    private Long studentId;
    private String status;
    private Double lastVerifyScore;
    private LocalDateTime lastVerifyAt;
    private LocalDateTime enteredAt;
    private LocalDateTime finishedAt;
}
