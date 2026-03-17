package com.kovr.proctor.api.dto;
/**
 * UpdateAnomalyPolicyReq 用于承载接口层传入或返回的数据，方便前端与后端围绕固定字段结构交换信息。
 * 字段说明：
 * - warningThreshold: 用于判定是否通过的阈值字段，前后端会根据它决定后续分支。
 * - severeThreshold: 用于判定是否通过的阈值字段，前后端会根据它决定后续分支。
 * - sampleIntervalMs: 该字段承载当前对象的一项业务属性，阅读时可以结合它所在类和数据库表一起理解。
 * - identityVerifyIntervalSec: 该字段承载当前对象的一项业务属性，阅读时可以结合它所在类和数据库表一起理解。
 * - maxReconnectCount: 该字段承载当前对象的一项业务属性，阅读时可以结合它所在类和数据库表一起理解。
 */

public record UpdateAnomalyPolicyReq(
        Double warningThreshold,
        Double severeThreshold,
        Long sampleIntervalMs,
        Long identityVerifyIntervalSec,
        Integer maxReconnectCount
) {
}
