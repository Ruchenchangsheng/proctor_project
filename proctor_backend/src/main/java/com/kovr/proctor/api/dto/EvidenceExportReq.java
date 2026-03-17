package com.kovr.proctor.api.dto;

import java.util.List;
/**
 * EvidenceExportReq 用于承载接口层传入或返回的数据，方便前端与后端围绕固定字段结构交换信息。
 * 字段说明：
 * - evidenceIds: 该字段承载当前对象的一项业务属性，阅读时可以结合它所在类和数据库表一起理解。
 */

public record EvidenceExportReq(List<String> evidenceIds) {
}
