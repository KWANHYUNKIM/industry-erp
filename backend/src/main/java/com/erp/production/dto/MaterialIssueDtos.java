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
            Long warehouseId,
            Long workOrderId,
            @NotNull @Positive(message = "불출수량은 0보다 커야 합니다.") BigDecimal qty,
            LocalDate issueDate,
            String note
    ) {}

    public record MaterialIssueResponse(
            Long id,
            Long itemId, String itemCode, String itemName, String unit,
            Long warehouseId, String warehouseName,
            Long workOrderId, String workOrderNo,
            BigDecimal qty, LocalDate issueDate, String note
    ) {
        public static MaterialIssueResponse from(MaterialIssue mi) {
            return new MaterialIssueResponse(
                    mi.getId(),
                    mi.getItem().getId(), mi.getItem().getCode(), mi.getItem().getName(), mi.getItem().getUnit(),
                    mi.getWarehouse() != null ? mi.getWarehouse().getId() : null,
                    mi.getWarehouse() != null ? mi.getWarehouse().getName() : null,
                    mi.getWorkOrder() != null ? mi.getWorkOrder().getId() : null,
                    mi.getWorkOrder() != null ? mi.getWorkOrder().getOrderNo() : null,
                    mi.getQty(), mi.getIssueDate(), mi.getNote());
        }
    }
}
