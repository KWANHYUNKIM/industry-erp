package com.erp.inventory.dto;

import com.erp.inventory.domain.Lot;
import com.erp.inventory.domain.enums.LotStatus;
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
            boolean held, LotStatus status, String statusName
    ) {
        public static LotResponse from(Lot l) {
            // 상태는 저장하지 않는다. 보유수량·보류 플래그에서 파생한다(LotStatus 참조).
            LotStatus status = LotStatus.of(l.isHeld(), l.getStockQty());
            return new LotResponse(
                    l.getId(), l.getLotNo(),
                    l.getItem().getId(), l.getItem().getCode(), l.getItem().getName(), l.getItem().getUnit(),
                    l.getWarehouse() != null ? l.getWarehouse().getId() : null,
                    l.getWarehouse() != null ? l.getWarehouse().getName() : null,
                    l.getInboundDate(), l.getExpireDate(),
                    l.getInboundQty(), l.getStockQty(),
                    l.isHeld(), status, status.getDisplayName());
        }
    }
}
