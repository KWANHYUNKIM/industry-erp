package com.erp.accounting.dto;

import com.erp.accounting.domain.Account;
import com.erp.accounting.domain.AccountDivision;
import jakarta.validation.constraints.Size;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

public final class AccountDtos {

    private AccountDtos() {}

    public record CreateAccountRequest(
            @Size(max = 20, message = "계정코드는 20자까지 넣을 수 있습니다.")
            @NotBlank(message = "계정코드를 입력하세요.") String code,
            @Size(max = 100, message = "계정과목명은 100자까지 넣을 수 있습니다.")
            @NotBlank(message = "계정과목명을 입력하세요.") String name,
            @NotNull(message = "구분을 선택하세요.") AccountDivision division,
            @Size(max = 50, message = "입력한 글자가 너무 깁니다. 50자까지 넣을 수 있습니다.")
            String detailCategory
    ) {}

    public record UpdateAccountRequest(
            @Size(max = 100, message = "입력한 글자가 너무 깁니다. 100자까지 넣을 수 있습니다.")
            String name,
            AccountDivision division,
            @Size(max = 50, message = "입력한 글자가 너무 깁니다. 50자까지 넣을 수 있습니다.")
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
