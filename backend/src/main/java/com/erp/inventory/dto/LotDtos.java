package com.erp.inventory.dto;

import com.erp.inventory.domain.Lot;
import com.erp.inventory.domain.LotTransaction;
import com.erp.inventory.domain.enums.LotStatus;
import com.erp.inventory.domain.enums.LotTxType;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;

import java.math.BigDecimal;
import java.time.LocalDate;

public final class LotDtos {

    private LotDtos() {}

    /** 로트 실사 조정 요청. 실사수량으로 로트 재고를 맞춘다. */
    public record AdjustLotRequest(
            @NotNull(message = "실사수량을 입력하세요.") BigDecimal actualQty,
            String note
    ) {}

    /** 로트 수불부/내역 한 줄. balanceAfter 는 그 시점 로트 재고. */
    public record LotTransactionResponse(
            Long id, Long lotId, String lotNo,
            Long itemId, String itemCode, String itemName, String unit,
            LocalDate txDate, LotTxType type, String typeName,
            BigDecimal quantityChange, BigDecimal balanceAfter,
            String note, String createdBy
    ) {
        public static LotTransactionResponse from(LotTransaction t) {
            Lot l = t.getLot();
            return new LotTransactionResponse(
                    t.getId(), l.getId(), l.getLotNo(),
                    l.getItem().getId(), l.getItem().getCode(), l.getItem().getName(), l.getItem().getUnit(),
                    t.getTxDate(), t.getType(), t.getType().getDisplayName(),
                    t.getQuantityChange(), t.getBalanceAfter(),
                    t.getNote(), t.getCreatedBy());
        }
    }

    public record CreateLotRequest(
            @NotBlank(message = "로트No.를 입력하세요.") String lotNo,
            @NotNull(message = "품목을 선택하세요.") Long itemId,
            Long warehouseId,
            LocalDate inboundDate,
            LocalDate expireDate,
            @NotNull(message = "입고수량을 입력하세요.") @Positive(message = "입고수량은 0보다 커야 합니다.") BigDecimal inboundQty
    ) {}

    public record ConsumeLotRequest(
            @NotNull(message = "출고수량을 입력하세요.") @Positive(message = "출고수량은 0보다 커야 합니다.") BigDecimal qty
    ) {}

    public record HoldLotRequest(
            boolean held
    ) {}

    public record LotResponse(
            Long id, String lotNo,
            Long itemId, String itemCode, String itemName, String unit,
            /** 규격. 원본 시리얼/로트No.등록의 열이 [품목명[규격]]·[규격] 이다. */
            String spec,
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
                    l.getItem().getSpec(),
                    l.getWarehouse() != null ? l.getWarehouse().getId() : null,
                    l.getWarehouse() != null ? l.getWarehouse().getName() : null,
                    l.getInboundDate(), l.getExpireDate(),
                    l.getInboundQty(), l.getStockQty(),
                    l.isHeld(), status, status.getDisplayName());
        }
    }
}
