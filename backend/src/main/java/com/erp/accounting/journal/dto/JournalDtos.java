package com.erp.accounting.journal.dto;

import com.erp.accounting.account.AccountDivision;
import com.erp.accounting.journal.JournalEntry;
import com.erp.accounting.journal.JournalLine;
import com.erp.accounting.journal.JournalSourceType;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.PositiveOrZero;
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
            String description,
            /** 줄의 [부서] · [프로젝트] (원본 일반전표 격자) */
            Long departmentId,
            Long projectId,
            /** 줄의 [거래처](원본 일반전표 격자 거래처코드 · 거래처명) — 비우면 전표 거래처를 따른다. */
            Long partnerId
    ) {}

    /**
     * 일반전표 직접입력 · 수정. 차변합=대변합이어야 저장된다.
     * 원본 일반전표(E010201)에는 머리 적요가 없다 — 비우면 첫 줄 적요가 전표 적요(회계거래조회 [적요])가 된다.
     */
    public record CreateJournalRequest(
            LocalDate entryDate,
            @Size(max = 300, message = "적요는 300자까지 넣을 수 있습니다.") String description,
            Long partnerId,
            /** 원소마다 {@code @Valid} — 없으면 리스트 안쪽 제약이 통째로 무시된다. */
            List<@jakarta.validation.Valid ManualLineInput> lines,
            /** 머리 [첨언내용] */
            @Size(max = 1000, message = "첨언내용은 1000자까지 넣을 수 있습니다.") String memo,
            /** 머리 [회계전표No.] — 사용자가 적는 글자(전표번호와 따로, V444) */
            @Size(max = 50, message = "회계전표No.는 50자까지 넣을 수 있습니다.") String acctDocNo
    ) {}

    /**
     * 회계 I › 매출/매입거래 › <b>매출전표 I · 매입전표 I</b> 한 장(2026-10-13 loginaa 실측) —
     * 일자 · 부서 · 프로젝트 · 부가세유형 · 거래처 · 공급가액 · 부가세 · 적요 · 매출(매입)계정 · 입금(출금)계좌.
     */
    public record VatSlipRequest(
            @NotNull(message = "매출 · 매입을 고르세요.") Boolean sales,
            LocalDate entryDate,
            Long departmentId,
            Long projectId,
            @NotBlank(message = "부가세유형: 자료를 입력 바랍니다.") @Size(max = 30, message = "부가세유형은 30자까지입니다.") String vatType,
            @NotNull(message = "거래처: 자료를 입력 바랍니다.") Long partnerId,
            @NotNull(message = "공급가액: 자료를 입력 바랍니다.") @Positive(message = "공급가액은 0보다 커야 합니다.") BigDecimal supplyAmount,
            @PositiveOrZero(message = "부가세는 0 이상이어야 합니다.") BigDecimal vatAmount,
            @Size(max = 300, message = "적요는 300자까지 넣을 수 있습니다.") String description,
            @NotNull(message = "매출계정: 자료를 입력 바랍니다.") Long accountId,
            @NotNull(message = "입금계좌: 자료를 입력 바랍니다.") Long settleAccountId,
            /** [수수료] — 차) 지급수수료(831) / 대) 입금(출금)계좌(2026-10-13 실측: 매출 · 매입 모두 같은 모양). */
            @PositiveOrZero(message = "수수료는 0 이상이어야 합니다.") BigDecimal feeAmount,
            /** [전자종류] — 붙는 유형(매출 세금계산서 · 영세율 · 계산서 …, 매입 세금계산서 · 불공 · 수입 …)에서만 화면이 보낸다. */
            @Size(max = 30, message = "전자종류는 30자까지입니다.") String eInvoiceKind,
            /** [예정누락분] true = 예정누락 */
            Boolean vatOmitted,
            /** 매출전표 I [세부내역] (매입전표 I 에는 이 칸이 없다) */
            @jakarta.validation.Valid VatDetail vatDetail
    ) {}

    /**
     * 매출전표 I [세부내역] 창(세금계산서내역등록) — 일련번호 · 청구/영수 · 비고 · 현금 · 수표 · 어음 · 외상매출금 + 품목 격자.
     * 원본은 격자의 공급가액 · 부가세 합계를 [적용(F8)] 때 전표의 공급가액 · 부가세로 옮긴다(화면이 한다).
     */
    public record VatDetail(
            @Size(max = 30, message = "일련번호는 30자까지입니다.") String serialNo,
            /** 청구 · 영수 */
            @Size(max = 10) String receipt,
            @Size(max = 300, message = "비고는 300자까지입니다.") String note,
            BigDecimal cash, BigDecimal check, BigDecimal bill, BigDecimal credit,
            @Size(max = 100, message = "세부내역은 100줄까지입니다.") List<@jakarta.validation.Valid VatDetailItem> items,
            /**
             * 매입/매출장 [세부내역]에 서는 적요 — 처음 저장할 때의 적요를 붙잡아 둔다(서버가 매긴다, 화면이 보낸 값은 버린다).
             * 2026-10-21 loginaa: 적요 없이 저장한 매출전표 I 에 수정 창에서 적요를 넣어도 장은 빈칸, 'QA회계1 세부B' 로 저장한 뒤
             * '세부C' 로 고쳐도 장은 세부B. 빈 글자 = 처음에 비어 있었다, null = 이 칸이 생기기 전 전표(그땐 지금 적요를 쓴다).
             */
            @Size(max = 200) String bookMemo
    ) {
        public VatDetail withBookMemo(String memo) {
            return new VatDetail(serialNo, receipt, note, cash, check, bill, credit, items, memo);
        }
    }

    public record VatDetailItem(
            LocalDate itemDate,
            @Size(max = 100, message = "품명은 100자까지입니다.") String name,
            @Size(max = 100, message = "규격은 100자까지입니다.") String spec,
            BigDecimal qty, BigDecimal unitPrice, BigDecimal supplyAmount, BigDecimal vatAmount,
            @Size(max = 100, message = "비고는 100자까지입니다.") String note
    ) {}

    /** 세부내역 ↔ JSON 글자(journal_entries.vat_detail). */
    private static final com.fasterxml.jackson.databind.ObjectMapper VAT_JSON =
            new com.fasterxml.jackson.databind.ObjectMapper().findAndRegisterModules()
                    .disable(com.fasterxml.jackson.databind.SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);

    public static String writeVatDetail(VatDetail d) {
        if (d == null) return null;
        try { return VAT_JSON.writeValueAsString(d); }
        catch (com.fasterxml.jackson.core.JsonProcessingException ex) { throw new IllegalStateException(ex); }
    }

    public static VatDetail readVatDetail(String json) {
        if (json == null || json.isBlank()) return null;
        try { return VAT_JSON.readValue(json, VatDetail.class); }
        catch (com.fasterxml.jackson.core.JsonProcessingException ex) { return null; }
    }

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
            BigDecimal debit, BigDecimal credit, String description,
            Long departmentId, Long projectId,
            /** 줄 거래처(V390 journal_lines.partner_id) — 없으면 null(전표 거래처는 머리 partnerId). */
            Long partnerId, String partnerCode, String partnerName
    ) {
        public static JournalLineResponse from(JournalLine l) {
            var p = l.getPartner();
            return new JournalLineResponse(
                    l.getId(), l.getLineNo(),
                    l.getAccount().getId(), l.getAccount().getCode(), l.getAccount().getName(),
                    l.getDebit(), l.getCredit(), l.getDescription(),
                    l.getDepartmentId(), l.getProjectId(),
                    p != null ? p.getId() : null, p != null ? p.getCode() : null, p != null ? p.getName() : null);
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
            String createdBy, java.time.LocalDateTime createdAt, java.time.LocalDateTime updatedAt,
            /** 원본 회계거래조회 탭 [결재중 · 미확인 · 확인] */
            com.erp.accounting.journal.JournalConfirmStatus confirmStatus,
            /** 매출전표 I · 매입전표 I 의 [부가세유형](V349) */
            String vatType,
            /** 매출전표 I · 매입전표 I 의 [전자종류] · [예정누락분] · [세부내역](V353) */
            String eInvoiceKind, boolean vatOmitted, VatDetail vatDetail,
            /** 회계거래조회 조건 [최종수정자](V353) */
            String updatedBy,
            /** 일반전표 [첨언내용] */
            String memo,
            /** 일반전표 [회계전표No.](V444) */
            String acctDocNo
    ) {
        public static JournalEntryResponse from(JournalEntry e) {
            return new JournalEntryResponse(
                    e.getId(), e.getDocNo(), e.getEntryDate(), e.getDescription(),
                    e.getPartner() != null ? e.getPartner().getId() : null,
                    e.getPartner() != null ? e.getPartner().getName() : null,
                    e.getSourceType(), e.getSourceType().getDisplayName(), e.getSourceId(),
                    e.totalDebit(), e.totalCredit(), e.isBalanced(),
                    e.getLines().stream().map(JournalLineResponse::from).toList(),
                    e.getCreatedBy(), e.getCreatedAt(), e.getUpdatedAt(),
                    e.getConfirmStatus(), e.getVatType(),
                    e.getEInvoiceKind(), e.isVatOmitted(), readVatDetail(e.getVatDetail()),
                    e.getUpdatedBy() != null ? e.getUpdatedBy() : e.getCreatedBy(),
                    e.getMemo(), e.getAcctDocNo());
        }
    }

    /** 회계거래조회 [확인] · [확인취소] — 고른 전표들의 진행상태를 바꾼다. */
    public record ChangeStatusRequest(
            @jakarta.validation.constraints.NotEmpty(message = "바꿀 전표를 고르세요.") List<Long> ids,
            @NotNull(message = "진행상태를 지정하세요.") com.erp.accounting.journal.JournalConfirmStatus status
    ) {}

    public record ChangeStatusResponse(int changed) {}

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

    /**
     * 재무제표 · 원가명세서 [부서표시방법] · [프로젝트표시방법] 종 · 횡 — 부서(또는 프로젝트)마다 계정 차변합 · 대변합.
     * groupId 가 null 이면 부서(프로젝트)가 없는 줄(원본 '기타').
     */
    public record GroupedAccountSum(
            Long groupId, Long accountId, String accountCode, String accountName, AccountDivision division,
            BigDecimal debit, BigDecimal credit
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

    /** 각종코드변경(E010111) — 알약 계정 · 거래처 · 부서 · 프로젝트. 0/null 인 조건은 끈다. */
    public record CodeChangeRequest(
            Kind kind,
            java.time.LocalDate from, java.time.LocalDate to,
            Long projectId, Long partnerId, Long departmentId,
            Long beforeId, Long afterId
    ) {
        public enum Kind { ACCOUNT, PARTNER, DEPARTMENT, PROJECT }
    }
}
