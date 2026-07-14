package com.erp.dto;

import com.erp.domain.Expense;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;

import java.math.BigDecimal;
import java.time.LocalDate;

public final class ExpenseDtos {

    private ExpenseDtos() {}

    public record CreateExpenseRequest(
            @NotNull(message = "계정과목을 선택하세요.") Long accountId,
            LocalDate expenseDate,
            String content,
            String partnerName,
            @NotNull @Positive(message = "금액은 0보다 커야 합니다.") BigDecimal amount,
            String paymentMethod,
            String department,
            /** 귀속 프로젝트 (선택) */
            Long projectId
    ) {}

    public record ExpenseResponse(
            Long id,
            LocalDate expenseDate,
            Long accountId, String accountName,
            String content, String partnerName,
            BigDecimal amount, String paymentMethod, String department,
            Long projectId, String projectName,
            String createdBy
    ) {
        public static ExpenseResponse from(Expense e) {
            return new ExpenseResponse(
                    e.getId(), e.getExpenseDate(),
                    e.getAccount().getId(), e.getAccount().getName(),
                    e.getContent(), e.getPartnerName(),
                    e.getAmount(), e.getPaymentMethod(), e.getDepartment(),
                    e.getProject() != null ? e.getProject().getId() : null,
                    e.getProject() != null ? e.getProject().getName() : null,
                    e.getCreatedBy());
        }
    }
}
