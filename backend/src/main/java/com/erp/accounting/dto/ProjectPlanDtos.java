package com.erp.accounting.dto;

import com.erp.accounting.domain.ProjectPlan;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;

import java.math.BigDecimal;

public final class ProjectPlanDtos {

    private ProjectPlanDtos() {}

    public record CreateProjectPlanRequest(
            @NotNull(message = "프로젝트를 선택하세요.") Long projectId,
            @NotNull @Min(value = 2000, message = "연도를 확인하세요.") Integer planYear,
            @NotNull @PositiveOrZero(message = "계획매출은 0 이상이어야 합니다.") BigDecimal planRevenue,
            @NotNull @PositiveOrZero(message = "계획원가는 0 이상이어야 합니다.") BigDecimal planCost,
            String remark
    ) {}

    public record ProjectPlanResponse(
            Long id, int planYear,
            Long projectId, String projectCode, String projectName,
            BigDecimal planRevenue, BigDecimal planCost, BigDecimal planProfit,
            String remark, String createdBy
    ) {
        public static ProjectPlanResponse from(ProjectPlan p) {
            BigDecimal profit = p.getPlanRevenue().subtract(p.getPlanCost());
            return new ProjectPlanResponse(
                    p.getId(), p.getPlanYear(),
                    p.getProject().getId(), p.getProject().getCode(), p.getProject().getName(),
                    p.getPlanRevenue(), p.getPlanCost(), profit,
                    p.getRemark(), p.getCreatedBy());
        }
    }

    /** 프로젝트계획/실적현황 한 줄: 계획 vs 실적(전표 집계)과 달성률. id 는 계획행 삭제용. */
    public record ComparisonRow(
            Long id, int planYear,
            Long projectId, String projectCode, String projectName,
            BigDecimal planRevenue, BigDecimal planCost, BigDecimal planProfit,
            BigDecimal actualRevenue, BigDecimal actualCost, BigDecimal actualProfit,
            BigDecimal revenueAchieveRate, BigDecimal profitAchieveRate
    ) {}
}
