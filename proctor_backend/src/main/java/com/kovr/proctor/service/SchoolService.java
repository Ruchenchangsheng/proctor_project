// src/main/java/com/kovr/proctor/service/SchoolService.java
package com.kovr.proctor.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.kovr.proctor.common.BusinessException;
import com.kovr.proctor.domain.entity.SchoolAdminEntity;
import com.kovr.proctor.domain.entity.SchoolEntity;
import com.kovr.proctor.domain.entity.UserEntity;
import com.kovr.proctor.infra.mapper.SchoolAdminMapper;
import com.kovr.proctor.infra.mapper.SchoolMapper;
import com.kovr.proctor.infra.mapper.UserMapper;
import com.kovr.proctor.util.PasswordGen;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 学校与学校管理员相关服务。
 * 关键点：邮件发送失败不会影响数据库事务（不抛异常，仅记录日志，并在返回体标记 mailSent=false）。
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class SchoolService {

    private final SchoolMapper schoolMapper;
    private final UserMapper userMapper;
    private final SchoolAdminMapper sapMapper;

    private final PasswordEncoder passwordEncoder;
    private final PasswordGen passwordGen;
    private final MailService mailService;

    /**
     * 创建学校，并同时创建学校管理员账号。
     *
     * @param schoolName 学校名称
     * @param adminName  学校管理员姓名
     * @param adminEmail 学校管理员邮箱（也是登录账号）
     * @return { ok, schoolId, adminUserId, mailSent }
     */
    @Transactional
    public Map<String, Object> createSchoolAndAdmin(String schoolName, String adminName, String adminEmail, String domain) {
        // 基础校验（Controller 已 @Valid，这里再做一些业务层幂等/冲突检查）
        // 1) 邮箱是否已存在（避免重复账号）
        UserEntity existed = userMapper.selectOne(
                new LambdaQueryWrapper<UserEntity>().eq(UserEntity::getEmail, adminEmail));
        if (existed != null) {
            throw new BusinessException("EMAIL_EXISTS", "该管理员邮箱已存在：" + adminEmail);
        }

        // 2) 创建学校
        SchoolEntity school = new SchoolEntity();
        school.setName(schoolName);
        school.setDomain(domain);
        schoolMapper.insert(school);

        // 3) 生成初始密码 + 创建用户
        String rawPwd = passwordGen.gen6();
        UserEntity admin = new UserEntity();
        admin.setEmail(adminEmail);
        admin.setName(adminName);
        admin.setRole("SCHOOL_ADMIN");
        admin.setEnabled(1);
        admin.setPassword(passwordEncoder.encode(rawPwd));
        userMapper.insert(admin);

        // 4) 绑定学校管理员档案
        SchoolAdminEntity profile = new SchoolAdminEntity();
        profile.setUserId(admin.getId());
        profile.setSchoolId(school.getId());
        sapMapper.insert(profile);

        // 5) 发送邮件（失败不抛异常，不回滚）
        boolean mailOk = false;
        try {
            mailOk = mailService.sendAccount(adminEmail, adminName, adminEmail, rawPwd);

        } catch (Exception e) {
            // 理论上 sendAccount 已吞异常返回 false，这里兜底
            log.warn("Send mail failed (unexpected). to={}, err={}", adminEmail, e.toString());
        }

        if (mailOk) {
            System.out.println("------邮箱发送成功   SchoolService------");
        } else {
            System.out.println("------邮箱发送失败   SchoolService------");
        }

        // 结果返回
        Map<String, Object> res = new LinkedHashMap<>();
        res.put("ok", true);
        res.put("schoolId", school.getId());
        res.put("adminUserId", admin.getId());
        res.put("mailSent", mailOk);
        return res;
    }
}
