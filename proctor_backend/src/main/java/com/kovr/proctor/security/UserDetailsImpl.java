package com.kovr.proctor.security;

import lombok.AllArgsConstructor;
import lombok.Getter;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.userdetails.UserDetails;

import java.util.Collection;
import java.util.List;
/**
 * UserDetailsImpl 把系统用户实体适配为 Spring Security 所需的用户信息对象。
 */

@Getter
@AllArgsConstructor
public class UserDetailsImpl implements UserDetails {
    private Long id;
    private String email;
    private String password;
    private String name;
    private String role;
    private boolean enabled;
    private boolean mustChangePassword;

    /**
     * 读取或查询当前业务场景下需要的数据。
     * 阅读这个方法时，可以重点关注它读取了哪些输入、修改了哪些状态，以及异常或边界条件如何处理。
     */
    @Override
    public Collection<? extends GrantedAuthority> getAuthorities() {
        return List.of(new SimpleGrantedAuthority("ROLE_" + role));
    }

    /**
     * 读取或查询当前业务场景下需要的数据。
     * 阅读这个方法时，可以重点关注它读取了哪些输入、修改了哪些状态，以及异常或边界条件如何处理。
     */
    @Override
    public String getUsername() {
        return email;
    }

    /**
     * 执行前置校验或条件判断，为后续主流程提供可靠分支依据。
     * 阅读这个方法时，可以重点关注它读取了哪些输入、修改了哪些状态，以及异常或边界条件如何处理。
     */
    @Override
    public boolean isAccountNonExpired() {
        return true;
    }

    /**
     * 执行前置校验或条件判断，为后续主流程提供可靠分支依据。
     * 阅读这个方法时，可以重点关注它读取了哪些输入、修改了哪些状态，以及异常或边界条件如何处理。
     */
    @Override
    public boolean isAccountNonLocked() {
        return true;
    }

    /**
     * 执行前置校验或条件判断，为后续主流程提供可靠分支依据。
     * 阅读这个方法时，可以重点关注它读取了哪些输入、修改了哪些状态，以及异常或边界条件如何处理。
     */
    @Override
    public boolean isCredentialsNonExpired() {
        return true;
    }

    /**
     * 执行前置校验或条件判断，为后续主流程提供可靠分支依据。
     * 阅读这个方法时，可以重点关注它读取了哪些输入、修改了哪些状态，以及异常或边界条件如何处理。
     */
    @Override
    public boolean isEnabled() {
        return enabled;
    }
}
