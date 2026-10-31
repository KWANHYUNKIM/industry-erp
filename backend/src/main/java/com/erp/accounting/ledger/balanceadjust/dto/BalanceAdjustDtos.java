package com.erp.accounting.ledger.balanceadjust.dto;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

/** 회계 I › FastEntry › 잔액조정(입력 · 실사조회 · 조회 · 현황) 요청 · 응답. */
public final class BalanceAdjustDtos {
    private BalanceAdjustDtos() {}

    /**
     * 잔액조정입력 격자 한 줄 — 계정 · 계정명 · 거래처별집계구분 · 차변금액 · 대변금액 · 진행단계.
     * 차변 쪽 계정(자산 · 비용)은 잔액을 차변금액에, 나머지는 대변금액에 둔다(원본: 외상매출금 −1,143,134,300 은 차변금액 칸에 음수).
     * adjustmentIds: 기준일자에 이 계정으로 이미 넣은 잔액조정 전표 — 있으면 진행단계가 [조정] 대신 [수정 · 추가 · 조회].
     */
    public record AccountBalanceRow(Long accountId, String code, String name, String division, String aggregation,
                                    BigDecimal debitAmount, BigDecimal creditAmount, List<Long> adjustmentIds,
                                    /** 거래처별집계구분 창 — ◉거래처별(아니면 ○없음) · ☑부서별집계 · ☑프로젝트별집계 */
                                    boolean byPartner, boolean byDept, boolean byProject) {}

    /** '거래처별집계구분' 창 [저장] — 계정의 집계 설정(accounts.partner_aggregate · aggregate_by_dept · aggregate_by_project). */
    public record AggregationRequest(boolean byPartner, boolean byDept, boolean byProject) {}

    /** 잔액실사(계정별) 창 한 줄 — 부서 · 프로젝트 묶음의 장부잔액. 실잔액은 화면이 넣는다(처음엔 장부잔액과 같다). */
    public record AuditGroupRow(Long partnerId, String partnerCode, String partnerName,
                                Long departmentId, Long projectId, BigDecimal bookAmount, BigDecimal actualAmount, String memo) {}

    /** byPartner 면 '잔액실사(거래처별)' 창 — 줄이 거래처(· 부서 · 프로젝트) 묶음이다. 아니면 '잔액실사(계정별)'(부서 · 프로젝트 묶음). */
    public record AuditResponse(LocalDate asOf, Long accountId, String accountCode, String accountName, List<AuditGroupRow> rows,
                                boolean byPartner, boolean byDept, boolean byProject) {}

    /** 실잔액을 넣은 줄. actualAmount 가 null 이면 '고치지 않은 줄'. */
    public record SaveRow(Long partnerId, Long departmentId, Long projectId, BigDecimal actualAmount, String memo) {}

    /**
     * [저장(F8)]. zeroUnchanged = '실잔액을 변경하지 않은 내역의 잔액을 0으로 조정'.
     * 수정이면 replaceEntryId 에 고칠 잔액조정 전표 id.
     */
    public record SaveRequest(LocalDate asOf, Long accountId, boolean zeroUnchanged, List<SaveRow> rows, Long replaceEntryId) {}

    /** 잔액조정조회 · 잔액실사조회 한 줄 = 잔액조정 전표 한 장. */
    public record AdjustmentRow(Long entryId, String docNo, LocalDate entryDate, Long accountId, String accountCode, String accountName,
                                BigDecimal bookAmount, BigDecimal actualAmount, String memo, String createdBy) {}

    /** 잔액조정현황 한 줄 = 조정 전표 줄 하나. 조정후잔액 · 차이를 계정의 차대 쪽에 둔다. */
    public record StatusRow(LocalDate entryDate, String accountCode, String accountName, String partnerName, Long departmentId, Long projectId,
                            BigDecimal afterDebit, BigDecimal afterCredit, BigDecimal diffDebit, BigDecimal diffCredit, String memo) {}
}
