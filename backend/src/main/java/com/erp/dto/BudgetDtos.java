package com.erp.dto;

import com.erp.domain.AccountDivision;
import com.erp.domain.enums.CashFlowType;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;

import java.math.BigDecimal;
import java.util.List;

public final class BudgetDtos {

    private BudgetDtos() {}

    // ── 예산관리 ──────────────────────────────────────────────────────

    public record BudgetRequest(
            @NotBlank(message = "귀속월(YYYY-MM)을 입력하세요.") String period,
            @NotNull(message = "계정과목을 선택하세요.") Long accountId,
            @NotNull @Positive(message = "예산액은 0보다 커야 합니다.") BigDecimal amount,
            String remark
    ) {}

    /** 편성액 수정. 귀속월·계정은 바꾸지 않는다(바꿔야 하면 지우고 다시 편성한다). */
    public record UpdateBudgetRequest(
            @NotNull @Positive(message = "예산액은 0보다 커야 합니다.") BigDecimal amount,
            String remark
    ) {}

    /** 예산 한 줄: 편성액 · 집행실적(회계전표 집계) · 집행률 · 잔여 */
    public record BudgetRow(
            Long id, String period,
            Long accountId, String accountCode, String accountName, AccountDivision division,
            BigDecimal amount,
            BigDecimal actual,
            BigDecimal remaining,
            BigDecimal executionRate,
            boolean over,
            String remark
    ) {}

    public record BudgetStatus(
            String period,
            BigDecimal totalBudget,
            BigDecimal totalActual,
            BigDecimal totalRemaining,
            BigDecimal executionRate,
            List<BudgetRow> rows
    ) {}

    // ── 자금계획 ──────────────────────────────────────────────────────

    public record CashPlanRequest(
            @NotBlank(message = "귀속월(YYYY-MM)을 입력하세요.") String period,
            @NotNull(message = "수입/지출을 선택하세요.") CashFlowType type,
            @NotBlank(message = "자금 항목을 입력하세요.") String category,
            @NotNull @Positive(message = "금액은 0보다 커야 합니다.") BigDecimal amount,
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
