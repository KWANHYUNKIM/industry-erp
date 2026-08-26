package com.erp.production.dto;

import com.erp.production.domain.ProductionPlan;
import com.erp.production.domain.ProductionPlanStatus;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;

import java.math.BigDecimal;

public final class ProductionPlanDtos {

    private ProductionPlanDtos() {}

    public record CreatePlanRequest(
            @NotNull(message = "제품을 선택하세요.") Long productId,
            @NotBlank(message = "계획주차를 입력하세요.") String planWeek,
            @NotNull(message = "소요량을 입력하세요.")
            @PositiveOrZero(message = "소요량은 0 이상이어야 합니다.") BigDecimal demandQty,
            @NotNull(message = "계획수량을 입력하세요.")
            @PositiveOrZero(message = "계획수량은 0 이상이어야 합니다.") BigDecimal planQty,
            String remark
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
            Long workOrderId, String workOrderNo, String remark
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
                    p.getRemark());
        }
    }
}
