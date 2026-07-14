package com.erp.dto;

import com.erp.domain.Income;
import com.erp.domain.enums.ReceiptMethod;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

public final class IncomeDtos {

    private IncomeDtos() {}

    /** 수입등록. 계좌입금이면 bankAccountId 가 있어야 한다. */
    public record CreateIncomeRequest(
            LocalDate incomeDate,
            @NotNull(message = "수익 계정을 선택하세요.") Long accountId,
            @NotBlank(message = "내용을 입력하세요.") String content,
            String partnerName,
            @NotNull @Positive(message = "금액은 0보다 커야 합니다.") BigDecimal amount,
            @NotNull(message = "회수 수단을 선택하세요.") ReceiptMethod receiptMethod,
            Long bankAccountId,
            String department
    ) {}

    public record IncomeResponse(
            Long id, LocalDate incomeDate,
            Long accountId, String accountCode, String accountName,
            String content, String partnerName, BigDecimal amount,
            ReceiptMethod receiptMethod, String receiptMethodName,
            Long bankAccountId, String bankAccountName,
            Long journalEntryId, String journalDocNo,
            String department, String createdBy
    ) {
        public static IncomeResponse from(Income i) {
            return new IncomeResponse(
                    i.getId(), i.getIncomeDate(),
                    i.getAccount().getId(), i.getAccount().getCode(), i.getAccount().getName(),
                    i.getContent(), i.getPartnerName(), i.getAmount(),
                    i.getReceiptMethod(), i.getReceiptMethod().getDisplayName(),
                    i.getBankAccount() != null ? i.getBankAccount().getId() : null,
                    i.getBankAccount() != null
                            ? i.getBankAccount().getBankName() + " " + i.getBankAccount().getAccountNo() : null,
                    i.getJournalEntry() != null ? i.getJournalEntry().getId() : null,
                    i.getJournalEntry() != null ? i.getJournalEntry().getDocNo() : null,
                    i.getDepartment(), i.getCreatedBy());
        }
    }

    /** 수입비용현황의 계정별 한 줄 */
    public record AccountSummaryRow(
            Long accountId, String accountCode, String accountName,
            BigDecimal amount, BigDecimal ratio
    ) {}

    /**
     * 수입비용현황: 기간 내 수입(incomes)과 비용(expenses)을 계정별로 모아 대조한다.
     * 판매/구매 전표에서 나온 매출·매입은 여기 들어오지 않는다 — 그건 손익계산서가 본다.
     */
    public record IncomeExpenseStatus(
            LocalDate from, LocalDate to,
            BigDecimal totalIncome,
            BigDecimal totalExpense,
            BigDecimal net,
            List<AccountSummaryRow> incomeByAccount,
            List<AccountSummaryRow> expenseByAccount
    ) {}
}
