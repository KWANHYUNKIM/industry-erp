package com.erp.production.dto;

import com.erp.production.domain.Production;
import com.erp.production.domain.ProductionMaterial;
import com.erp.production.domain.WorkOrder;
import com.erp.production.domain.WorkOrderStatus;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

public final class ProductionDtos {

    private ProductionDtos() {}

    // ===== 작업지시 =====

    public record CreateWorkOrderRequest(
            @NotNull(message = "제품을 선택하세요.") Long productId,
            @NotNull(message = "창고를 선택하세요.") Long warehouseId,
            @NotNull @Positive(message = "지시수량은 0보다 커야 합니다.") BigDecimal plannedQty,
            LocalDate orderDate,
            LocalDate dueDate,
            String remark
    ) {}

    public record WorkOrderResponse(
            Long id, String orderNo,
            Long productId, String productCode, String productName, String productUnit,
            Long warehouseId, String warehouseName,
            BigDecimal plannedQty, BigDecimal producedQty, BigDecimal remainingQty,
            WorkOrderStatus status, String statusName,
            LocalDate orderDate, LocalDate dueDate, String remark, String createdBy
    ) {
        public static WorkOrderResponse from(WorkOrder w) {
            BigDecimal remaining = w.getPlannedQty().subtract(w.getProducedQty());
            return new WorkOrderResponse(
                    w.getId(), w.getOrderNo(),
                    w.getProduct().getId(), w.getProduct().getCode(), w.getProduct().getName(), w.getProduct().getUnit(),
                    w.getWarehouse().getId(), w.getWarehouse().getName(),
                    w.getPlannedQty(), w.getProducedQty(), remaining,
                    w.getStatus(), w.getStatus().getDisplayName(),
                    w.getOrderDate(), w.getDueDate(), w.getRemark(), w.getCreatedBy());
        }
    }

    // ===== 생산실적 =====

    public record CreateProductionRequest(
            @NotNull(message = "작업지시를 선택하세요.") Long workOrderId,
            @NotNull @Positive(message = "생산수량은 0보다 커야 합니다.") BigDecimal producedQty,
            LocalDate productionDate,
            /** 선택: 수동 소모자재 목록. 있으면 이 목록대로 소모, 없으면 BOM 자동소모 */
            List<@Valid ManualConsumeLine> materials
    ) {}

    public record ManualConsumeLine(
            @NotNull(message = "소모자재를 선택하세요.") Long componentId,
            @NotNull @Positive(message = "소모수량은 0보다 커야 합니다.") BigDecimal quantity
    ) {}

    public record ProductionMaterialResponse(
            Long componentId, String componentCode, String componentName, String unit, BigDecimal quantity
    ) {
        static ProductionMaterialResponse from(ProductionMaterial m) {
            return new ProductionMaterialResponse(
                    m.getComponent().getId(), m.getComponent().getCode(), m.getComponent().getName(),
                    m.getComponent().getUnit(), m.getQuantity());
        }
    }

    public record ProductionResponse(
            Long id, String prodNo,
            Long workOrderId, String workOrderNo,
            Long productId, String productCode, String productName, String productUnit,
            Long warehouseId, String warehouseName,
            BigDecimal producedQty, LocalDate productionDate, String createdBy,
            List<ProductionMaterialResponse> materials
    ) {
        public static ProductionResponse from(Production p) {
            return new ProductionResponse(
                    p.getId(), p.getProdNo(),
                    p.getWorkOrder().getId(), p.getWorkOrder().getOrderNo(),
                    p.getProduct().getId(), p.getProduct().getCode(), p.getProduct().getName(), p.getProduct().getUnit(),
                    p.getWarehouse().getId(), p.getWarehouse().getName(),
                    p.getProducedQty(), p.getProductionDate(), p.getCreatedBy(),
                    p.getMaterials().stream().map(ProductionMaterialResponse::from).toList());
        }
    }
}
