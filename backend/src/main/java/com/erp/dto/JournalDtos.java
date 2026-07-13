package com.erp.dto;

import com.erp.domain.AccountDivision;
import com.erp.domain.JournalEntry;
import com.erp.domain.JournalLine;
import com.erp.domain.JournalSourceType;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

public final class JournalDtos {

    private JournalDtos() {}

    public record JournalLineResponse(
            Long id, int lineNo,
            Long accountId, String accountCode, String accountName,
            BigDecimal debit, BigDecimal credit, String description
    ) {
        public static JournalLineResponse from(JournalLine l) {
            return new JournalLineResponse(
                    l.getId(), l.getLineNo(),
                    l.getAccount().getId(), l.getAccount().getCode(), l.getAccount().getName(),
                    l.getDebit(), l.getCredit(), l.getDescription());
        }
    }

    public record JournalEntryResponse(
            Long id, String docNo, LocalDate entryDate, String description,
            Long partnerId, String partnerName,
            JournalSourceType sourceType, String sourceTypeName, Long sourceId,
            BigDecimal totalDebit, BigDecimal totalCredit, boolean balanced,
            List<JournalLineResponse> lines
    ) {
        public static JournalEntryResponse from(JournalEntry e) {
            return new JournalEntryResponse(
                    e.getId(), e.getDocNo(), e.getEntryDate(), e.getDescription(),
                    e.getPartner() != null ? e.getPartner().getId() : null,
                    e.getPartner() != null ? e.getPartner().getName() : null,
                    e.getSourceType(), e.getSourceType().getDisplayName(), e.getSourceId(),
                    e.totalDebit(), e.totalCredit(), e.isBalanced(),
                    e.getLines().stream().map(JournalLineResponse::from).toList());
        }
    }

    /** 계정별원장 한 줄 (잔액은 서비스가 누적 계산) */
    public record LedgerRow(
            LocalDate entryDate, String docNo, String description,
            String partnerName,
            BigDecimal debit, BigDecimal credit, BigDecimal balance
    ) {}

    public record AccountLedgerResponse(
            Long accountId, String accountCode, String accountName, AccountDivision division,
            BigDecimal totalDebit, BigDecimal totalCredit, BigDecimal closingBalance,
            List<LedgerRow> rows
    ) {}

    /** 합계잔액시산표 한 줄 */
    public record TrialBalanceRow(
            Long accountId, String accountCode, String accountName, AccountDivision division,
            BigDecimal debit, BigDecimal credit, BigDecimal balance
    ) {}

    public record TrialBalanceResponse(
            LocalDate from, LocalDate to,
            BigDecimal totalDebit, BigDecimal totalCredit, boolean balanced,
            List<TrialBalanceRow> rows
    ) {}

    /** 재무제표(재무상태표/손익계산서) 한 줄 */
    public record StatementRow(
            String accountCode, String accountName, AccountDivision division, BigDecimal amount
    ) {}

    public record BalanceSheetResponse(
            LocalDate asOf,
            List<StatementRow> assets, BigDecimal totalAssets,
            List<StatementRow> liabilities, BigDecimal totalLiabilities,
            List<StatementRow> equity, BigDecimal totalEquity,
            BigDecimal netIncome,
            boolean balanced
    ) {}

    public record IncomeStatementResponse(
            LocalDate from, LocalDate to,
            List<StatementRow> revenues, BigDecimal totalRevenue,
            List<StatementRow> expenses, BigDecimal totalExpense,
            BigDecimal netIncome
    ) {}
}
