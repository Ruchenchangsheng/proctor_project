package com.kovr.proctor.domain.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;
/**
 * UserEntity 对应数据库中的一类持久化记录，字段基本都会直接映射到表列或查询结果。
 * 字段说明：
 * - id: 当前记录在对应数据表中的主键标识。
 * - email: 登录邮箱或联系邮箱字段，系统内很多账号以它作为唯一登录名。
 * - password: 密码相关字段；在持久化对象中通常保存加密后的口令，在请求对象中通常表示用户输入。
 * - name: 展示给用户看的名称字段，具体含义取决于所在对象，例如学校名、考试名或人员姓名。
 * - role: 用户角色，用于前后端共同判断权限和页面入口。
 * - enabled: 启停用状态，1/0 或 true/false 通常分别表示可登录和被冻结。
 * - mustChangePassword: 密码相关字段；在持久化对象中通常保存加密后的口令，在请求对象中通常表示用户输入。
 * - failedLoginAttempts: 该字段承载当前对象的一项业务属性，阅读时可以结合它所在类和数据库表一起理解。
 * - lockedUntil: 该字段承载当前对象的一项业务属性，阅读时可以结合它所在类和数据库表一起理解。
 * - createdAt: 记录创建时间，方便审计和排序。
 * - updatedAt: 记录最后更新时间，方便判断最近一次变更。
 */

@Data
@TableName("users")
public class UserEntity {
    @TableId(type = IdType.AUTO)
    private Long id;
    private String email;
    private String password;
    private String name;
    private String role;
    private Integer enabled;
    private Integer mustChangePassword;
    private Integer failedLoginAttempts;
    private LocalDateTime lockedUntil;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
