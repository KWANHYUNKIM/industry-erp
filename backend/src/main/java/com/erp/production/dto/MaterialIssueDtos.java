package com.erp.production.dto;

import com.erp.production.domain.MaterialIssue;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;

import java.math.BigDecimal;
import java.time.LocalDate;

public final class MaterialIssueDtos {

    private MaterialIssueDtos() {}

    public record CreateMaterialIssueRequest(
            @NotNull(message = "자재(품목)를 선택하세요.") Long itemId,
            /** 보내는창고 */
            Long warehouseId,
            /** 받는공장. 원본은 이 둘 사이를 옮기는 전표다. */
            Long toWarehouseId,
            Long workOrderId,
            @NotNull(message = "불출수량을 입력하세요.") @Positive(message = "불출수량은 0보다 커야 합니다.") BigDecimal qty,
            LocalDate issueDate,
            /** 담당자(사원) id. 원본 생산불출입력 머리의 [담당자]. */
            Long employeeId,
            String note
    ) {}

    public record MaterialIssueResponse(
            Long id,
            Long itemId, String itemCode, String itemName, String unit,
            Long warehouseId, String warehouseName,
            /** 받는공장 */
            Long toWarehouseId, String toWarehouseName,
            Long workOrderId, String workOrderNo,
            /**
             * 작업지시가 가리키는 <b>생산품목</b>. 원본 생산불출입력 머리의 [생산품목] 이고
             * 그리드의 [작업지시품목코드] 이기도 하다. 작업지시 없이 낸 불출이면 null.
             */
            String productCode, String productName,
            /** 담당자(사원) id. 이름은 화면이 붙인다 — production 은 hr 을 참조할 수 없다. */
            Long employeeId,
            BigDecimal qty, LocalDate issueDate, String note
    ) {
        public static MaterialIssueResponse from(MaterialIssue mi) {
            return new MaterialIssueResponse(
                    mi.getId(),
                    mi.getItem().getId(), mi.getItem().getCode(), mi.getItem().getName(), mi.getItem().getUnit(),
                    mi.getWarehouse() != null ? mi.getWarehouse().getId() : null,
                    mi.getWarehouse() != null ? mi.getWarehouse().getName() : null,
                    mi.getToWarehouse() != null ? mi.getToWarehouse().getId() : null,
                    mi.getToWarehouse() != null ? mi.getToWarehouse().getName() : null,
                    mi.getWorkOrder() != null ? mi.getWorkOrder().getId() : null,
                    mi.getWorkOrder() != null ? mi.getWorkOrder().getOrderNo() : null,
                    mi.getWorkOrder() != null ? mi.getWorkOrder().getProduct().getCode() : null,
                    mi.getWorkOrder() != null ? mi.getWorkOrder().getProduct().getName() : null,
                    mi.getEmployeeId(),
                    mi.getQty(), mi.getIssueDate(), mi.getNote());
        }
    }
}
