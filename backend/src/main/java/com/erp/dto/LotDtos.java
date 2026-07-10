package com.erp.dto;

import com.erp.domain.Lot;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;

import java.math.BigDecimal;
import java.time.LocalDate;

public final class LotDtos {

    private LotDtos() {}

    public record CreateLotRequest(
            @NotBlank(message = "로트No.를 입력하세요.") String lotNo,
            @NotNull(message = "품목을 선택하세요.") Long itemId,
            Long warehouseId,
            LocalDate inboundDate,
            LocalDate expireDate,
            @NotNull @Positive(message = "입고수량은 0보다 커야 합니다.") BigDecimal inboundQty
    ) {}

    public record ConsumeLotRequest(
            @NotNull @Positive(message = "출고수량은 0보다 커야 합니다.") BigDecimal qty
    ) {}

    public record HoldLotRequest(
            boolean held
    ) {}

    public record LotResponse(
            Long id, String lotNo,
            Long itemId, String itemCode, String itemName, String unit,
            Long warehouseId, String warehouseName,
            LocalDate inboundDate, LocalDate expireDate,
            BigDecimal inboundQty, BigDecimal stockQty,
            boolean held, String statusName
    ) {
        public static LotResponse from(Lot l) {
            String status = l.isHeld() ? "보류"
                    : l.getStockQty().signum() <= 0 ? "출고완료"
                    : "재고";
            return new LotResponse(
                    l.getId(), l.getLotNo(),
                    l.getItem().getId(), l.getItem().getCode(), l.getItem().getName(), l.getItem().getUnit(),
                    l.getWarehouse() != null ? l.getWarehouse().getId() : null,
                    l.getWarehouse() != null ? l.getWarehouse().getName() : null,
                    l.getInboundDate(), l.getExpireDate(),
                    l.getInboundQty(), l.getStockQty(),
                    l.isHeld(), status);
        }
    }
}
