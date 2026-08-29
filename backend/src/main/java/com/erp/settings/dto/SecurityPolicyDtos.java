package com.erp.settings.dto;

import com.erp.settings.domain.SecurityPolicy;
import jakarta.validation.constraints.PositiveOrZero;

public final class SecurityPolicyDtos {

    private SecurityPolicyDtos() {}

    public record SecurityPolicyRequest(
            Integer pwLength,
            @PositiveOrZero(message = "비밀번호 변경주기는 0 이상이어야 합니다.")
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
