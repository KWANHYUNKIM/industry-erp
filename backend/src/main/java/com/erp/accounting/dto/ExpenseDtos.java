package com.erp.accounting.dto;

import com.erp.accounting.domain.Expense;
import jakarta.validation.constraints.Size;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;

import java.math.BigDecimal;
import java.time.LocalDate;

public final class ExpenseDtos {

    private ExpenseDtos() {}

    public record CreateExpenseRequest(
            @NotNull(message = "계정과목을 선택하세요.") Long accountId,
            LocalDate expenseDate,
            @Size(max = 300, message = "입력한 글자가 너무 깁니다. 300자까지 넣을 수 있습니다.")
            String content,
            @Size(max = 200, message = "입력한 글자가 너무 깁니다. 200자까지 넣을 수 있습니다.")
            String partnerName,
            @NotNull(message = "금액을 입력하세요.") @Positive(message = "금액은 0보다 커야 합니다.") BigDecimal amount,
            @Size(max = 30, message = "입력한 글자가 너무 깁니다. 30자까지 넣을 수 있습니다.")
            String paymentMethod,
            @Size(max = 50, message = "입력한 글자가 너무 깁니다. 50자까지 넣을 수 있습니다.")
            String department,
            /** 귀속 프로젝트 (선택) */
            Long projectId
    ) {}

    public record ExpenseResponse(
            Long id,
            /** 비용 전표번호. 원본 비용내역현황의 [일자-No.] 가 이 값이다. */
            String docNo,
            LocalDate expenseDate,
            Long accountId, String accountName,
            /**
             * 원본 [비용그룹명]. 우리에겐 비용그룹 마스터가 없어 계정과목의 세부분류로 갈음한다 —
             * 없으면 계정구분(판매관리비 등)을 쓴다. 없는 마스터를 지어내지 않는다.
             */
            String accountGroupName,
            String content, String partnerName,
            /** 거래처 마스터와 이름이 정확히 일치할 때만 채워진다(아니면 null) */
            Long partnerId,
            BigDecimal amount, String paymentMethod, String department,
            Long projectId, String projectName,
            String createdBy
    ) {
        public static ExpenseResponse from(Expense e) {
            String group = e.getAccount().getDetailCategory();
            if (group == null || group.isBlank()) {
                group = e.getAccount().getDivision() != null
                        ? e.getAccount().getDivision().getDisplayName() : null;
            }
            return new ExpenseResponse(
                    e.getId(), e.getDocNo(), e.getExpenseDate(),
                    e.getAccount().getId(), e.getAccount().getName(),
                    group,
                    e.getContent(), e.getPartnerName(),
                    e.getPartner() != null ? e.getPartner().getId() : null,
                    e.getAmount(), e.getPaymentMethod(), e.getDepartment(),
                    e.getProject() != null ? e.getProject().getId() : null,
                    e.getProject() != null ? e.getProject().getName() : null,
                    e.getCreatedBy());
        }
    }
}
