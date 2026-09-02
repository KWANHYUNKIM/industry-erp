package com.erp.production.dto;

import com.erp.production.domain.ProductionPlan;
import com.erp.production.domain.ProductionPlanStatus;
import jakarta.validation.constraints.Size;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;

import java.math.BigDecimal;
import java.util.List;

public final class ProductionPlanDtos {

    private ProductionPlanDtos() {}

    public record CreatePlanRequest(
            @NotNull(message = "제품을 선택하세요.") Long productId,
            @Size(max = 20, message = "계획주차는 20자까지 넣을 수 있습니다.")
            @NotBlank(message = "계획주차를 입력하세요.") String planWeek,
            @NotNull(message = "소요량을 입력하세요.")
            @PositiveOrZero(message = "소요량은 0 이상이어야 합니다.") BigDecimal demandQty,
            @NotNull(message = "계획수량을 입력하세요.")
            @PositiveOrZero(message = "계획수량은 0 이상이어야 합니다.") BigDecimal planQty,
            @Size(max = 300, message = "입력한 글자가 너무 깁니다. 300자까지 넣을 수 있습니다.")
            String remark
    ) {}

    /**
     * 원본 생산계획/MRP생성 팝업의 <b>[생산계획대상-전표]</b> — 미판매 · 매출계획 ·
     * 미구매 · 미생산/미소모 중 무엇을 근거로 계획을 만들 것인가.
     *
     * <p>우리는 <b>미판매</b>만 낸다. 주문은 받았는데 아직 매출로 못 끊은 잔량이고,
     * 그 계산은 이미 미판매현황이 하고 있다. 나머지 셋은 근거가 없다 —
     * 매출계획은 품목이 아니라 거래처·금액 단위라 몇 개를 만들지 나오지 않고,
     * 미구매·미생산/미소모는 소요량 전개(BOM 역산) 엔진이 있어야 한다.
     */
    public record GeneratePlanRequest(
            @Size(max = 20, message = "계획주차는 20자까지 넣을 수 있습니다.")
            @NotBlank(message = "계획주차를 입력하세요.") String planWeek,
            /** 재고를 빼고 볼 것인가. 안 주면 뺀다 — 창고에 있는 것을 또 만들 이유가 없다. */
            Boolean deductStock
    ) {}

    /** 생성 결과. 왜 몇 건인지 말해 준다 — 0건일 때 이유를 모르면 고장으로 읽힌다. */
    public record GenerateResult(
            int created, int skippedExisting, int skippedCovered, List<PlanResponse> plans
    ) {}

    public record UpdatePlanStatusRequest(
            @NotNull(message = "진행상태를 선택하세요.") ProductionPlanStatus status
    ) {}

    public record PlanResponse(
            Long id,
            Long productId, String productCode, String productName, String productUnit,
            String planWeek,
            BigDecimal demandQty, BigDecimal currentStock, BigDecimal planQty, BigDecimal shortage,
            ProductionPlanStatus status, String statusName,
            Long workOrderId, String workOrderNo, String remark,
            /**
             * 원본 생산계획/MRP생성의 <b>[생성일자]</b> 조건이 보는 값 — 이 계획을 만든 때다.
             * 계획주차(planWeek)와 <b>다르다</b>: 주차는 '언제 만들 것인가' 이고
             * 이것은 '언제 만들었나' 다. 지난주에 뽑아 둔 계획과 오늘 새로 뽑은 계획이
             * 같은 주차로 섞여 있으면 어느 것이 새것인지 알 수가 없다.
             */
            java.time.LocalDateTime createdAt
    ) {
        public static PlanResponse from(ProductionPlan p, BigDecimal currentStock) {
            BigDecimal shortage = p.getDemandQty().subtract(currentStock);
            if (shortage.signum() < 0) shortage = BigDecimal.ZERO;
            var wo = p.getWorkOrder();
            return new PlanResponse(
                    p.getId(),
                    p.getProduct().getId(), p.getProduct().getCode(), p.getProduct().getName(), p.getProduct().getUnit(),
                    p.getPlanWeek(),
                    p.getDemandQty(), currentStock, p.getPlanQty(), shortage,
                    p.getStatus(), p.getStatus().getDisplayName(),
                    wo != null ? wo.getId() : null,
                    wo != null ? wo.getOrderNo() : null,
                    p.getRemark(), p.getCreatedAt());
        }
    }
}
