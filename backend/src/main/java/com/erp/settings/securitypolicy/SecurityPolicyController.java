package com.erp.settings.securitypolicy;

import com.erp.settings.securitypolicy.dto.SecurityPolicyDtos.SecurityPolicyRequest;
import com.erp.settings.securitypolicy.dto.SecurityPolicyDtos.SecurityPolicyResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;
import com.erp.settings.securitypolicy.dto.SecurityPolicyDtos;

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
