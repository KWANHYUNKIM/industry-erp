package com.erp.accounting.journal.dto;

import com.erp.accounting.account.AccountDivision;
import com.erp.accounting.journal.JournalEntry;
import com.erp.accounting.journal.JournalLine;
import com.erp.accounting.journal.JournalSourceType;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;
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
            @Size(max = 300, message = "적요는 300자까지 넣을 수 있습니다.")
            @NotBlank(message = "적요를 입력하세요.") String description,
            Long partnerId,
            /** 원소마다 {@code @Valid} — 없으면 리스트 안쪽 제약이 통째로 무시된다. */
            List<@jakarta.validation.Valid ManualLineInput> lines
    ) {}

    /** 현금거래 간편입력. 입금이면 차)현금·대)상대계정, 출금이면 차)상대계정·대)현금. */
    public record CashTxnRequest(
            LocalDate entryDate,
            @NotNull(message = "입출금 구분을 지정하세요.") Boolean deposit,
            @NotNull(message = "상대 계정을 선택하세요.") Long counterAccountId,
            @Positive(message = "금액은 0보다 커야 합니다.")
            @NotNull(message = "금액을 입력하세요.") BigDecimal amount,
            Long partnerId,
            @Size(max = 300, message = "입력한 글자가 너무 깁니다. 300자까지 넣을 수 있습니다.")
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

    /**
     * 회계전표조회 응답 — <b>줄이 너무 많으면 앞부분만</b> 준다.
     *
     * <p>이 화면은 연초부터를 기본으로 열어서, 재 보니 <b>2만 9천 줄·16MB</b> 를 받고 있었다.
     * 원본도 큰 결과를 그냥 주지 않는다 — 조회 화면 139곳에 [오천건이상조회] 버튼을 두고
     * 그 위로는 눌러야 가게 한다(사본 실측). 재고수불부와 같은 방식이다.
     */
    public record JournalListResponse(
            List<JournalEntryResponse> rows,
            long totalRows,
            boolean truncated
    ) {}

    public record JournalEntryResponse(
            Long id, String docNo, LocalDate entryDate, String description,
            Long partnerId, String partnerName,
            JournalSourceType sourceType, String sourceTypeName, Long sourceId,
            BigDecimal totalDebit, BigDecimal totalCredit, boolean balanced,
            List<JournalLineResponse> lines,
            /** 원본 거래이력조회(회계)의 [작업자] · [작업일자] — 만든 사람 · 만든 때 · 마지막으로 고친 때. */
            String createdBy, java.time.LocalDateTime createdAt, java.time.LocalDateTime updatedAt
    ) {
        public static JournalEntryResponse from(JournalEntry e) {
            return new JournalEntryResponse(
                    e.getId(), e.getDocNo(), e.getEntryDate(), e.getDescription(),
                    e.getPartner() != null ? e.getPartner().getId() : null,
                    e.getPartner() != null ? e.getPartner().getName() : null,
                    e.getSourceType(), e.getSourceType().getDisplayName(), e.getSourceId(),
                    e.totalDebit(), e.totalCredit(), e.isBalanced(),
                    e.getLines().stream().map(JournalLineResponse::from).toList(),
                    e.getCreatedBy(), e.getCreatedAt(), e.getUpdatedAt());
        }
    }

    /** 계정별원장 한 줄 (잔액은 서비스가 누적 계산) */
    public record LedgerRow(
            LocalDate entryDate, String docNo, String description,
            String partnerName,
            BigDecimal debit, BigDecimal credit, BigDecimal balance,
            /**
             * 원본 현금출납장의 [상대계정명] — 같은 전표의 다른 줄 계정. 둘 이상이면 첫 계정 '외 n'.
             * 계정별원장 화면은 이 칸을 쓰지 않는다.
             */
            String counterAccountName,
            /** 원본 계정별거래처별원장 — 거래처마다 원장을 가르려면 이름이 아니라 id 가 있어야 한다(이름은 겹칠 수 있다). */
            Long partnerId
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
