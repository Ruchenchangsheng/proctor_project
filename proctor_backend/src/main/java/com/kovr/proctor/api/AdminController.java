package com.kovr.proctor.api;

import com.kovr.proctor.api.dto.CreateSchoolReq;
import com.kovr.proctor.infra.mapper.SchoolMapper;
import com.kovr.proctor.service.SchoolService;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/admin")
@RequiredArgsConstructor
public class AdminController {
    private final SchoolMapper schoolMapper;
    private final SchoolService schoolService;

    @GetMapping("/schools")
    @PreAuthorize("hasRole('ADMIN')")
    public List<Map<String, Object>> listSchools() {
        return schoolMapper.selectSchoolsWithAdmins();
    }

    @PostMapping("/schools")
    @PreAuthorize("hasRole('ADMIN')")
    public Map<String, Object> create(@RequestBody CreateSchoolReq req) {
        // 返回包含 mailSent 的结果，前端可提示“邮件发送失败请手动通知”等
        return schoolService.createSchoolAndAdmin(req.schoolName(), req.adminName(), req.adminEmail(), req.domain());
    }
}
