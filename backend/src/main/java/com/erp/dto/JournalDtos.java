package com.erp.dto;

import com.erp.domain.AccountDivision;
import com.erp.domain.JournalEntry;
import com.erp.domain.JournalLine;
import com.erp.domain.JournalSourceType;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

public final class JournalDtos {

    private JournalDtos() {}

    /** 일반전표 직접입력의 분개 라인. 차변 또는 대변 한쪽만 채운다. */
    public record ManualLineInput(
            @NotNull(message = "계정을 선택하세요.") Long accountId,
            BigDecimal debit,
            BigDecimal credit,
            String description
    ) {}

    /** 일반전표 직접입력. 차변합=대변합이어야 저장된다. */
    public record CreateJournalRequest(
            LocalDate entryDate,
            @NotBlank(message = "적요를 입력하세요.") String description,
            Long partnerId,
            List<ManualLineInput> lines
    ) {}

    /** 현금거래 간편입력. 입금이면 차)현금·대)상대계정, 출금이면 차)상대계정·대)현금. */
    public record CashTxnRequest(
            LocalDate entryDate,
            @NotNull(message = "입출금 구분을 지정하세요.") Boolean deposit,
            @NotNull(message = "상대 계정을 선택하세요.") Long counterAccountId,
            @NotNull(message = "금액을 입력하세요.") BigDecimal amount,
            Long partnerId,
            String description
    ) {}

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
