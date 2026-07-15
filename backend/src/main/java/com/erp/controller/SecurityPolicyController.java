package com.erp.controller;

import com.erp.dto.SecurityPolicyDtos.SecurityPolicyRequest;
import com.erp.dto.SecurityPolicyDtos.SecurityPolicyResponse;
import com.erp.service.SecurityPolicyService;
import lombok.RequiredArgsConstructor;
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
    public SecurityPolicyResponse save(@RequestBody SecurityPolicyRequest req) {
        return securityPolicyService.save(req);
    }
}
