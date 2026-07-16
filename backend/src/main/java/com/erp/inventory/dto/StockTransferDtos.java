package com.erp.inventory.dto;

import com.erp.inventory.domain.StockTransfer;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;

import java.math.BigDecimal;
import java.time.LocalDate;

public final class StockTransferDtos {

    private StockTransferDtos() {}

    public record CreateTransferRequest(
            @NotNull(message = "품목을 선택하세요.") Long itemId,
            @NotNull(message = "출고창고를 선택하세요.") Long fromWarehouseId,
            @NotNull(message = "입고창고를 선택하세요.") Long toWarehouseId,
            @NotNull @Positive(message = "이동수량은 0보다 커야 합니다.") BigDecimal quantity,
            LocalDate transferDate,
            String reason
    ) {}

    public record TransferResponse(
            Long id, String transferNo, LocalDate transferDate,
            Long itemId, String itemCode, String itemName, String unit,
            Long fromWarehouseId, String fromWarehouseName,
            Long toWarehouseId, String toWarehouseName,
            BigDecimal quantity, String reason, String createdBy
    ) {
        public static TransferResponse from(StockTransfer t) {
            return new TransferResponse(
                    t.getId(), t.getTransferNo(), t.getTransferDate(),
                    t.getItem().getId(), t.getItem().getCode(), t.getItem().getName(), t.getItem().getUnit(),
                    t.getFromWarehouse().getId(), t.getFromWarehouse().getName(),
                    t.getToWarehouse().getId(), t.getToWarehouse().getName(),
                    t.getQuantity(), t.getReason(), t.getCreatedBy());
        }
    }
}
