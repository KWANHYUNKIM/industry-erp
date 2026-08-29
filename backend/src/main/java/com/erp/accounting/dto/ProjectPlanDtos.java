package com.erp.accounting.dto;

import com.erp.accounting.domain.ProjectPlan;
import jakarta.validation.constraints.Size;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;

import java.math.BigDecimal;
import java.time.LocalDate;

public final class ProjectPlanDtos {

    private ProjectPlanDtos() {}

    public record CreateProjectPlanRequest(
            @NotNull(message = "프로젝트를 선택하세요.") Long projectId,
            @NotNull(message = "계획연도를 입력하세요.") @Min(value = 2000, message = "연도를 확인하세요.") Integer planYear,
            @NotNull(message = "계획매출을 입력하세요.") @PositiveOrZero(message = "계획매출은 0 이상이어야 합니다.") BigDecimal planRevenue,
            @NotNull(message = "계획원가를 입력하세요.") @PositiveOrZero(message = "계획원가는 0 이상이어야 합니다.") BigDecimal planCost,
            @Size(max = 300, message = "입력한 글자가 너무 깁니다. 300자까지 넣을 수 있습니다.")
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
            BigDecimal revenueAchieveRate, BigDecimal profitAchieveRate,
            /*
             * 원본 프로젝트계획 조건에 <b>[시작일]·[종료일]·[적요]</b> 가 있다(사본 실측).
             * 시작·종료는 프로젝트 마스터의 것이고 적요는 계획행의 것인데, 셋 다
             * 응답에 싣지 않아 <b>화면이 볼 수도 거를 수도 없었다.</b>
             */
            LocalDate startDate, LocalDate endDate, String remark
    ) {}
}
