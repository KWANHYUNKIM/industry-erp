package com.erp.inventory.dto;

import com.erp.inventory.domain.StagedStockAdjustment;
import com.erp.inventory.domain.enums.StagedStatus;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;

import java.math.BigDecimal;
import java.time.LocalDate;

public final class StagedAdjustmentDtos {

    private StagedAdjustmentDtos() {}

    public record CreateStagedRequest(
            @NotNull(message = "품목을 선택하세요.") Long itemId,
            @NotNull(message = "창고를 선택하세요.") Long warehouseId,
            @NotNull @PositiveOrZero(message = "실사수량은 0 이상이어야 합니다.") BigDecimal actualQty,
            LocalDate requestDate,
            String reason
    ) {}

    public record StagedResponse(
            Long id, String adjustNo, LocalDate requestDate,
            Long itemId, String itemCode, String itemName, String unit,
            Long warehouseId, String warehouseName,
            BigDecimal bookQty, BigDecimal actualQty, BigDecimal diff,
            String reason, StagedStatus status, String statusName,
            String requester, String handler
    ) {
        public static StagedResponse from(StagedStockAdjustment s) {
            BigDecimal diff = s.getActualQty().subtract(s.getBookQty());
            return new StagedResponse(
                    s.getId(), s.getAdjustNo(), s.getRequestDate(),
                    s.getItem().getId(), s.getItem().getCode(), s.getItem().getName(), s.getItem().getUnit(),
                    s.getWarehouse().getId(), s.getWarehouse().getName(),
                    s.getBookQty(), s.getActualQty(), diff,
                    s.getReason(), s.getStatus(), s.getStatus().getDisplayName(),
                    s.getRequester(), s.getHandler());
        }
    }
}
