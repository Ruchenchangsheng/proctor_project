package com.kovr.proctor.security;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.kovr.proctor.domain.entity.UserEntity;
import com.kovr.proctor.infra.mapper.UserMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class UserDetailsServiceImpl implements UserDetailsService {
    private final UserMapper userMapper;

    @Override
    public UserDetails loadUserByUsername(String subject) throws UsernameNotFoundException {
        UserEntity u = null;
        if (subject != null && subject.matches("^\\d+$")) {
            // ✅ 如果 subject 是纯数字，当作 userId 查
            u = userMapper.selectById(Long.parseLong(subject));
        } else if (subject != null) {
            // ✅ 否则当作 email 查
            u = userMapper.selectOne(new LambdaQueryWrapper<UserEntity>().eq(UserEntity::getEmail, subject));
        }
        if (u == null || u.getEnabled() == null || u.getEnabled() == 0) {
            throw new UsernameNotFoundException("用户不存在或已禁用");
        }
        return new UserDetailsImpl(u.getId(), u.getEmail(), u.getPassword(), u.getName(), u.getRole(), u.getEnabled() == 1);
    }
}
