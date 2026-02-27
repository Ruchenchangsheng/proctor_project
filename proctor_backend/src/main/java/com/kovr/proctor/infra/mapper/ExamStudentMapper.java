package com.kovr.proctor.infra.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.kovr.proctor.domain.entity.ExamStudentEntity;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface ExamStudentMapper extends BaseMapper<ExamStudentEntity> {
}
