package com.erp.accounting.ledger.account.dto;

import com.erp.accounting.ledger.account.Account;
import com.erp.accounting.ledger.account.AccountCashFlowKind;
import com.erp.accounting.ledger.account.AccountDebitCredit;
import com.erp.accounting.ledger.account.AccountDivision;
import com.erp.accounting.ledger.account.AccountEvalKind;
import com.erp.accounting.ledger.account.AccountRelatedWork;
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
            String detailCategory,
            AccountRelatedWork relatedWork,
            Boolean partnerAggregate,
            Long parentId,
            Boolean groupAccount,
            AccountDebitCredit debitCredit,
            AccountEvalKind evalKind,
            AccountCashFlowKind cashFlowKind,
            @Size(max = 100, message = "입력한 글자가 너무 깁니다. 100자까지 넣을 수 있습니다.") String searchKeyword,
            @Size(max = 100, message = "입력한 글자가 너무 깁니다. 100자까지 넣을 수 있습니다.") String remark1,
            @Size(max = 100, message = "입력한 글자가 너무 깁니다. 100자까지 넣을 수 있습니다.") String remark2,
            /** [표시순서] · 표시방법 탭 [들여쓰기순서] · [표시방법1] · [표시방법2](V457) */
            Integer displayOrder, Integer indentOrder, Boolean showMethod1, Boolean showMethod2
    ) {}

    public record UpdateAccountRequest(
            @Size(max = 100, message = "입력한 글자가 너무 깁니다. 100자까지 넣을 수 있습니다.")
            String name,
            AccountDivision division,
            @Size(max = 50, message = "입력한 글자가 너무 깁니다. 50자까지 넣을 수 있습니다.")
            String detailCategory,
            Boolean active,
            AccountRelatedWork relatedWork,
            Boolean partnerAggregate,
            Long parentId,
            Boolean groupAccount,
            AccountDebitCredit debitCredit,
            AccountEvalKind evalKind,
            AccountCashFlowKind cashFlowKind,
            @Size(max = 100, message = "입력한 글자가 너무 깁니다. 100자까지 넣을 수 있습니다.") String searchKeyword,
            @Size(max = 100, message = "입력한 글자가 너무 깁니다. 100자까지 넣을 수 있습니다.") String remark1,
            @Size(max = 100, message = "입력한 글자가 너무 깁니다. 100자까지 넣을 수 있습니다.") String remark2,
            /** [표시순서] · 표시방법 탭 [들여쓰기순서] · [표시방법1] · [표시방법2](V457) */
            Integer displayOrder, Integer indentOrder, Boolean showMethod1, Boolean showMethod2
    ) {}

    public record AccountResponse(
            Long id, String code, String name,
            AccountDivision division, String divisionName,
            String detailCategory, boolean active,
            AccountRelatedWork relatedWork, String relatedWorkName, boolean partnerAggregate,
            Long parentId, boolean groupAccount,
            AccountDebitCredit debitCredit, String debitCreditName,
            AccountEvalKind evalKind, String evalKindName,
            AccountCashFlowKind cashFlowKind, String searchKeyword, String remark1, String remark2,
            /** 원본 [계정종류] 자산 · 부채 · 자본 · 손익 */
            String kindName,
            Integer displayOrder, int indentOrder, boolean showMethod1, boolean showMethod2
    ) {
        public static AccountResponse from(Account a) {
            return new AccountResponse(
                    a.getId(), a.getCode(), a.getName(),
                    a.getDivision(), a.getDivision().getDisplayName(),
                    a.getDetailCategory(), a.isActive(),
                    a.getRelatedWork(), a.getRelatedWork().getDisplayName(), a.isPartnerAggregate(),
                    a.getParent() == null ? null : a.getParent().getId(), a.isGroupAccount(),
                    a.getDebitCredit(), a.getDebitCredit().getDisplayName(),
                    a.getEvalKind(), a.getEvalKind().getDisplayName(),
                    a.getCashFlowKind(), a.getSearchKeyword(), a.getRemark1(), a.getRemark2(),
                    switch (a.getDivision()) {
                        case ASSET -> "자산";
                        case LIABILITY -> "부채";
                        case EQUITY -> "자본";
                        default -> "손익";
                    },
                    a.getDisplayOrder(), a.getIndentOrder() == null ? 0 : a.getIndentOrder(), a.isShowMethod1(), a.isShowMethod2());
        }
    }
}
