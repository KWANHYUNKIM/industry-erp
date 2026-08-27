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
            @NotNull(message = "지시수량을 입력하세요.") @Positive(message = "지시수량은 0보다 커야 합니다.") BigDecimal plannedQty,
            LocalDate orderDate,
            LocalDate dueDate,
            /** 납품처. 원본 작업지시서입력 머리의 [납품처]. */
            Long partnerId,
            /** 담당자(사원) id. 이름은 화면이 붙인다 — production 은 hr 을 참조할 수 없다. */
            Long employeeId,
            String remark
    ) {
        /**
         * 품목·창고·수량·일자만 아는 자리에서 쓴다(생산계획에서 작업지시를 자동 생성할 때).
         * 위치 인자로 부르면 필드가 늘 때마다 깨진다 — 여기로 모아 둔다.
         */
        public static CreateWorkOrderRequest of(Long productId, Long warehouseId,
                                                BigDecimal plannedQty, LocalDate orderDate,
                                                String remark) {
            return new CreateWorkOrderRequest(
                    productId, warehouseId, plannedQty, orderDate, null, null, null, remark);
        }
    }

    public record WorkOrderResponse(
            Long id, String orderNo,
            Long productId, String productCode, String productName, String productUnit,
            Long warehouseId, String warehouseName,
            /** 납품처. 원본 작업지시서조회의 [거래처명] 열. */
            Long partnerId, String partnerName,
            /** 담당자(사원) id. 이름은 화면이 사원 목록에서 붙인다. */
            Long employeeId,
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
                    w.getPartner() != null ? w.getPartner().getId() : null,
                    w.getPartner() != null ? w.getPartner().getName() : null,
                    w.getEmployeeId(),
                    w.getPlannedQty(), w.getProducedQty(), remaining,
                    w.getStatus(), w.getStatus().getDisplayName(),
                    w.getOrderDate(), w.getDueDate(), w.getRemark(), w.getCreatedBy());
        }
    }

    // ===== 생산실적 =====

    public record CreateProductionRequest(
            @NotNull(message = "작업지시를 선택하세요.") Long workOrderId,
            @NotNull(message = "생산수량을 입력하세요.") @Positive(message = "생산수량은 0보다 커야 합니다.") BigDecimal producedQty,
            LocalDate productionDate,
            /**
             * 생산된공장 — 자재를 소모한 곳. 안 주면 작업지시의 창고에서 소모한다.
             * 원본은 [생산된공장] → [받는창고] 로 옮기는 전표다.
             */
            Long fromWarehouseId,
            /** 받는창고 — 완제품이 들어갈 곳. 안 주면 작업지시의 창고. */
            Long warehouseId,
            /** 귀속 프로젝트. 원본 생산입고현황 조건의 [프로젝트]. 안 정할 수 있다. */
            Long projectId,
            /** 적요. 원본 생산입고현황·생산입고 III 그리드의 마지막 열. */
            String note,
            /** 원본 [노무시간](분). 안 주면 null 이다 — 0 과 다르다. */
            Integer laborMinutes,
            /** 선택: 수동 소모자재 목록. 있으면 이 목록대로 소모, 없으면 BOM 자동소모 */
            List<@Valid ManualConsumeLine> materials
    ) {
        /**
         * 작업지시·수량·일자만 아는 자리에서 쓴다(시드 초기화 같은 곳).
         *
         * <p>record 를 위치 인자로 부르면 필드가 하나 늘 때마다 그 자리가 깨진다 —
         * 이 record 에서만 두 번 깨졌다(받는창고 때, 프로젝트 때). 여기로 모아 두면
         * 필드가 늘어도 <b>이 한 줄만</b> 고치면 된다.
         */
        public static CreateProductionRequest of(Long workOrderId, BigDecimal producedQty,
                                                 LocalDate productionDate) {
            return new CreateProductionRequest(
                    workOrderId, producedQty, productionDate, null, null, null, null, null, null);
        }
    }

    public record ManualConsumeLine(
            @NotNull(message = "소모자재를 선택하세요.") Long componentId,
            @NotNull(message = "소모수량을 입력하세요.") @Positive(message = "소모수량은 0보다 커야 합니다.") BigDecimal quantity
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
            /** 받는창고 — 완제품이 들어간 곳. 원본 [받는창고명]. */
            Long warehouseId, String warehouseName,
            /** 생산된공장 — 자재를 소모한 곳. 원본 [생산된공장명]. 안 정했으면 null. */
            Long fromWarehouseId, String fromWarehouseName,
            BigDecimal producedQty, LocalDate productionDate, String createdBy,
            /** 귀속 프로젝트. 원본 생산입고현황 조건의 [프로젝트]. */
            Long projectId, String projectName,
            /** 적요. 원본 생산입고현황의 마지막 열. */
            String note,
            /** 원본 [노무시간](분). 안 적었으면 null — 0 과 다르다. */
            Integer laborMinutes,
            List<ProductionMaterialResponse> materials
    ) {
        public static ProductionResponse from(Production p) {
            return new ProductionResponse(
                    p.getId(), p.getProdNo(),
                    p.getWorkOrder().getId(), p.getWorkOrder().getOrderNo(),
                    p.getProduct().getId(), p.getProduct().getCode(), p.getProduct().getName(), p.getProduct().getUnit(),
                    p.getWarehouse().getId(), p.getWarehouse().getName(),
                    p.getFromWarehouse() != null ? p.getFromWarehouse().getId() : null,
                    p.getFromWarehouse() != null ? p.getFromWarehouse().getName() : null,
                    p.getProducedQty(), p.getProductionDate(), p.getCreatedBy(),
                    p.getProject() != null ? p.getProject().getId() : null,
                    p.getProject() != null ? p.getProject().getName() : null,
                    p.getNote(), p.getLaborMinutes(),
                    p.getMaterials().stream().map(ProductionMaterialResponse::from).toList());
        }
    }
}
