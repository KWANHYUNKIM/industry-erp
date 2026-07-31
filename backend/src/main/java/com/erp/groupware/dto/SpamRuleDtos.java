package com.erp.groupware.dto;

import com.erp.groupware.domain.SpamRule;
import com.erp.groupware.domain.enums.SpamRuleKind;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

public final class SpamRuleDtos {

    private SpamRuleDtos() {}

    public record SaveSpamRuleRequest(
            @NotNull(message = "판단 기준을 선택하세요.") SpamRuleKind kind,
            @NotBlank(message = "걸러낼 문자열을 입력하세요.") String pattern,
            Boolean active,
            String note
    ) {}

    public record SpamRuleResponse(
            Long id, SpamRuleKind kind, String kindName,
            String pattern, boolean active, String note
    ) {
        public static SpamRuleResponse from(SpamRule r) {
            return new SpamRuleResponse(r.getId(), r.getKind(), r.getKind().getDisplayName(),
                    r.getPattern(), r.isActive(), r.getNote());
        }
    }
}
