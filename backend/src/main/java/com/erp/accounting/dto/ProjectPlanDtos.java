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
            /*
             * 원본 격자의 <b>[구매]·[노무비]·[경비]</b>. 안 적을 수도 있어 필수가 아니다 —
             * 안 주면 0 이다. 응답에만 싣고 요청에서 빠뜨리면 화면이 값을 보내도 서버가
             * 조용히 버린다(dto-check 가 보는 자리다).
             */
            @PositiveOrZero(message = "계획구매는 0 이상이어야 합니다.") BigDecimal planPurchase,
            @PositiveOrZero(message = "계획노무비는 0 이상이어야 합니다.") BigDecimal planLabor,
            @PositiveOrZero(message = "계획경비는 0 이상이어야 합니다.") BigDecimal planExpense,
            @Size(max = 300, message = "입력한 글자가 너무 깁니다. 300자까지 넣을 수 있습니다.")
            String remark
    ) {}

    public record ProjectPlanResponse(
            Long id, int planYear,
            Long projectId, String projectCode, String projectName,
            BigDecimal planRevenue, BigDecimal planCost, BigDecimal planProfit,
            /** 원본 격자의 [구매]·[노무비]·[경비]. 안 적었으면 0. */
            BigDecimal planPurchase, BigDecimal planLabor, BigDecimal planExpense,
            String remark, String createdBy
    ) {
        public static ProjectPlanResponse from(ProjectPlan p) {
            BigDecimal profit = p.getPlanRevenue().subtract(p.getPlanCost());
            return new ProjectPlanResponse(
                    p.getId(), p.getPlanYear(),
                    p.getProject().getId(), p.getProject().getCode(), p.getProject().getName(),
                    p.getPlanRevenue(), p.getPlanCost(), profit,
                    p.getPlanPurchase(), p.getPlanLabor(), p.getPlanExpense(),
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
             * 원본 격자의 <b>[판매]·[구매]·[노무비]·[경비]</b> 네 갈래(2026-09-01 실측).
             * 판매는 planRevenue 가 곧 그것이고, 나머지 셋은 담을 데가 없어 못 내다가
             * V212 로 자리를 만들었다.
             */
            BigDecimal planPurchase, BigDecimal planLabor, BigDecimal planExpense,
            /*
             * 원본 프로젝트계획 조건에 <b>[시작일]·[종료일]·[적요]</b> 가 있다(사본 실측).
             * 시작·종료는 프로젝트 마스터의 것이고 적요는 계획행의 것인데, 셋 다
             * 응답에 싣지 않아 <b>화면이 볼 수도 거를 수도 없었다.</b>
             */
            LocalDate startDate, LocalDate endDate, String remark,
            /*
             * 원본 조건 [기타]의 <b>[수정일자순(정렬)]</b> 이 쓰는 축(2026-09-01 E040636 실측).
             * 그 축이 응답에 없어 정렬을 만들 수 없었다 — BaseTimeEntity 가 이미 들고 있는
             * 값이라 싣기만 하면 된다. 매출계획조회에서 같은 자리를 같은 방식으로 채웠다.
             */
            java.time.LocalDateTime updatedAt
    ) {}
}
