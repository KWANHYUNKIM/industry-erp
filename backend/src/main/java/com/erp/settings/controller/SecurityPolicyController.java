package com.erp.settings.controller;

import com.erp.settings.dto.SecurityPolicyDtos.SecurityPolicyRequest;
import com.erp.settings.dto.SecurityPolicyDtos.SecurityPolicyResponse;
import com.erp.settings.service.SecurityPolicyService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;
import com.erp.settings.dto.SecurityPolicyDtos;

@RestController
@RequestMapping("/api/security-policy")
@RequiredArgsConstructor
public class SecurityPolicyController {

    private final SecurityPolicyService securityPolicyService;

    @GetMapping
    public SecurityPolicyResponse get() {
        return securityPolicyService.get();
    }

    @PutMapping
    public SecurityPolicyResponse save(@RequestBody SecurityPolicyRequest req) {
        return securityPolicyService.save(req);
    }
}
