package com.erp.controller;

import com.erp.dto.SecurityPolicyDtos.SecurityPolicyRequest;
import com.erp.dto.SecurityPolicyDtos.SecurityPolicyResponse;
import com.erp.service.SecurityPolicyService;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

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
    @PreAuthorize("hasAnyRole('ADMIN','MANAGER')")
    public SecurityPolicyResponse save(@RequestBody SecurityPolicyRequest req) {
        return securityPolicyService.save(req);
    }
}
