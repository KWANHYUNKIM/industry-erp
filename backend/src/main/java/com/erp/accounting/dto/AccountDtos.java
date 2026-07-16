package com.erp.accounting.dto;

import com.erp.accounting.domain.Account;
import com.erp.accounting.domain.AccountDivision;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

public final class AccountDtos {

    private AccountDtos() {}

    public record CreateAccountRequest(
            @NotBlank(message = "계정코드를 입력하세요.") String code,
            @NotBlank(message = "계정과목명을 입력하세요.") String name,
            @NotNull(message = "구분을 선택하세요.") AccountDivision division,
            String detailCategory
    ) {}

    public record UpdateAccountRequest(
            String name,
            AccountDivision division,
            String detailCategory,
            Boolean active
    ) {}

    public record AccountResponse(
            Long id, String code, String name,
            AccountDivision division, String divisionName,
            String detailCategory, boolean active
    ) {
        public static AccountResponse from(Account a) {
            return new AccountResponse(
                    a.getId(), a.getCode(), a.getName(),
                    a.getDivision(), a.getDivision().getDisplayName(),
                    a.getDetailCategory(), a.isActive());
        }
    }
}
