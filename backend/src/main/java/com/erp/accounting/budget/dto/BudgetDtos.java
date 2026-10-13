package com.erp.accounting.budget.dto;

import com.erp.accounting.account.AccountDivision;
import com.erp.accounting.cash.CashFlowType;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

public final class BudgetDtos {

    private BudgetDtos() {}

    // ── 예산관리(월별예산조회 E020201 · 출력물 E020202~06) ─────────────────

    /** 월별예산조회 목록 한 줄 — 계정마다 그 해 모든 부서 · 프로젝트 예산 합. */
    public record BudgetAccountRow(
            Long accountId, String accountCode, String accountName, AccountDivision division,
            BigDecimal total
    ) {}

    /** 예산입력 창의 한 줄(부서 × 프로젝트) — months 는 1~12월. 부서 · 프로젝트 null = '기타'. */
    public record BudgetPlanLine(
            Long id, Long departmentId, Long projectId, String remark,
            List<BigDecimal> months, BigDecimal total
    ) {}

    public record BudgetAccountDetail(
            int year, Long accountId, String accountCode, String accountName,
            List<BudgetPlanLine> lines
    ) {}

    /** 예산입력 [저장] — 계정 하나의 줄을 통째로. id 가 있으면 고치고 없으면 더한다(빠진 줄은 그대로 둔다 — 원본도 줄을 못 지운다). */
    public record SaveBudgetRequest(
            @NotNull(message = "기준년도를 입력하세요.") Integer year,
            @NotNull(message = "계정을 선택하세요.") Long accountId,
            @NotNull List<@Valid BudgetLineRequest> lines
    ) {}

    public record BudgetLineRequest(
            Long id, Long departmentId, Long projectId, String remark,
            @NotNull(message = "월별 예산을 입력하세요.") @Size(min = 12, max = 12, message = "월별 예산은 12달입니다.")
            List<@NotNull @PositiveOrZero(message = "예산은 0 이상이어야 합니다.") BigDecimal> months
    ) {}

    /** 목록 [선택삭제] — 고른 계정의 그 해 예산을 통째로 지운다. */
    public record DeleteBudgetRequest(
            @NotNull(message = "기준년도를 입력하세요.") Integer year,
            @NotEmpty(message = "리스트에 선택된 자료가 없습니다.") List<Long> accountIds
    ) {}

    /** 출력물 공통 자료 — 예산 줄(계정 × 부서 × 프로젝트 × 해 × 12달)과 그 계정들의 전표 실적 줄. */
    public record BudgetReport(
            List<BudgetReportPlan> plans,
            List<BudgetActualLine> actuals
    ) {}

    public record BudgetReportPlan(
            int year, Long accountId, String accountCode, String accountName,
            Long departmentId, Long projectId, List<BigDecimal> months
    ) {}

    /** 실적 한 줄 — amount 는 계정구분의 증가 방향(비용 · 자산 차 − 대, 나머지 대 − 차). */
    public record BudgetActualLine(
            Long journalId, LocalDate date, String docNo, String description, String partnerName,
            Long accountId, BigDecimal amount, Long departmentId, Long projectId
    ) {}

    // ── 자금계획 ──────────────────────────────────────────────────────

    public record CashPlanRequest(
            @NotBlank(message = "귀속월(YYYY-MM)을 입력하세요.") String period,
            @NotNull(message = "수입/지출을 선택하세요.") CashFlowType type,
            @NotBlank(message = "자금 항목을 입력하세요.") String category,
            @NotNull(message = "금액을 입력하세요.") @Positive(message = "금액은 0보다 커야 합니다.") BigDecimal amount,
            String remark
    ) {}

    public record CashPlanRow(
            Long id, String period,
            CashFlowType type, String typeName,
            String category, BigDecimal amount, String remark
    ) {}

    /**
     * 자금수지표: 계획(항목별 합계) 대비 실적(그 달의 계좌 입출금 합계).
     * 실적은 계좌 입출금만 센다 — 현금 시재는 계좌 밖이라 자금계획 대상이 아니다.
     */
    public record CashPlanStatus(
            String period,
            BigDecimal plannedInflow,
            BigDecimal plannedOutflow,
            BigDecimal plannedNet,
            BigDecimal actualInflow,
            BigDecimal actualOutflow,
            BigDecimal actualNet,
            BigDecimal inflowDiff,
            BigDecimal outflowDiff,
            List<CashPlanRow> plans
    ) {}
}
