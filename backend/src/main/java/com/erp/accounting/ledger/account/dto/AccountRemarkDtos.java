package com.erp.accounting.ledger.account.dto;

import com.erp.accounting.ledger.account.AccountRemark;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** 계정별 적요(적요리스트 · 적요등록). */
public final class AccountRemarkDtos {
    private AccountRemarkDtos() {}

    public record AccountRemarkRequest(
            @Size(max = 10, message = "적요코드는 10자까지 넣을 수 있습니다.") String code,
            @NotBlank(message = "적요명을 입력합니다.")
            @Size(max = 100, message = "입력한 글자가 너무 깁니다. 100자까지 넣을 수 있습니다.") String name
    ) {}

    public record AccountRemarkResponse(Long id, Long accountId, String code, String name) {
        public static AccountRemarkResponse from(AccountRemark r) {
            return new AccountRemarkResponse(r.getId(), r.getAccount().getId(), r.getCode(), r.getName());
        }
    }
}
