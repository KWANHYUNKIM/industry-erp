package com.erp.service;

import com.erp.domain.SecurityPolicy;
import com.erp.dto.SecurityPolicyDtos.SecurityPolicyRequest;
import com.erp.dto.SecurityPolicyDtos.SecurityPolicyResponse;
import com.erp.repository.SecurityPolicyRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class SecurityPolicyService {

    private final SecurityPolicyRepository securityPolicyRepository;

    /** 보안정책 조회. 미등록 시 엔티티 기본값으로 채운 응답 반환. */
    @Transactional(readOnly = true)
    public SecurityPolicyResponse get() {
        return securityPolicyRepository.findFirstByOrderByIdAsc()
                .map(SecurityPolicyResponse::from)
                .orElseGet(() -> SecurityPolicyResponse.from(SecurityPolicy.builder().build()));
    }

    /** 단일 레코드 upsert(있으면 수정, 없으면 생성). null 필드는 기존/기본값 유지. */
    @Transactional
    public SecurityPolicyResponse save(SecurityPolicyRequest req) {
        SecurityPolicy s = securityPolicyRepository.findFirstByOrderByIdAsc()
                .orElseGet(() -> SecurityPolicy.builder().build());

        if (req.pwLength() != null) s.setPwLength(req.pwLength());
        if (req.pwCycleDays() != null) s.setPwCycleDays(req.pwCycleDays());
        if (req.loginFailLimit() != null) s.setLoginFailLimit(req.loginFailLimit());
        if (req.sessionTimeout() != null) s.setSessionTimeout(req.sessionTimeout());
        if (req.ipRestrict() != null) s.setIpRestrict(req.ipRestrict());
        if (req.twoFactor() != null) s.setTwoFactor(req.twoFactor());

        return SecurityPolicyResponse.from(securityPolicyRepository.save(s));
    }
}
