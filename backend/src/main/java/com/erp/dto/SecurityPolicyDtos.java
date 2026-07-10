package com.erp.dto;

import com.erp.domain.SecurityPolicy;

public final class SecurityPolicyDtos {

    private SecurityPolicyDtos() {}

    public record SecurityPolicyRequest(
            Integer pwLength,
            Integer pwCycleDays,
            Integer loginFailLimit,
            Integer sessionTimeout,
            Boolean ipRestrict,
            Boolean twoFactor
    ) {}

    public record SecurityPolicyResponse(
            Long id,
            Integer pwLength,
            Integer pwCycleDays,
            Integer loginFailLimit,
            Integer sessionTimeout,
            Boolean ipRestrict,
            Boolean twoFactor
    ) {
        public static SecurityPolicyResponse from(SecurityPolicy s) {
            if (s == null) return null;
            return new SecurityPolicyResponse(
                    s.getId(), s.getPwLength(), s.getPwCycleDays(), s.getLoginFailLimit(),
                    s.getSessionTimeout(), s.getIpRestrict(), s.getTwoFactor());
        }
    }
}
