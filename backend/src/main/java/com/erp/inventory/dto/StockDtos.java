package com.erp.inventory.dto;

import com.erp.inventory.domain.Stock;
import com.erp.inventory.domain.StockTransaction;
import com.erp.inventory.domain.StockTransactionType;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;

import java.math.BigDecimal;
import java.time.LocalDate;

public final class StockDtos {

    private StockDtos() {}

    /** 입고/출고/조정 요청. quantity 는 항상 양수, 방향은 type 이 결정.
     *  (조정에서 감소가 필요하면 type=ADJUST + direction=false) */
    public record StockTransactionRequest(
            @NotNull(message = "품목을 선택하세요.") Long itemId,
            @NotNull(message = "창고를 선택하세요.") Long warehouseId,
            @NotNull(message = "유형을 선택하세요.") StockTransactionType type,
            @NotNull @Positive(message = "수량은 0보다 커야 합니다.") BigDecimal quantity,
            /** ADJUST 시 증가(true)/감소(false). INBOUND/OUTBOUND 에서는 무시 */
            Boolean increase,
            BigDecimal unitPrice,
            LocalDate transactionDate,
            String note
    ) {}

    public record StockTransactionResponse(
            Long id,
            Long itemId,
            String itemCode,
            String itemName,
            String unit,
            Long warehouseId,
            String warehouseName,
            StockTransactionType type,
            String typeName,
            BigDecimal quantityChange,
            BigDecimal balanceAfter,
            BigDecimal unitPrice,
            LocalDate transactionDate,
            String note,
            String createdBy
    ) {
        public static StockTransactionResponse from(StockTransaction t) {
            return new StockTransactionResponse(
                    t.getId(),
                    t.getItem().getId(),
                    t.getItem().getCode(),
                    t.getItem().getName(),
                    t.getItem().getUnit(),
                    t.getWarehouse().getId(),
                    t.getWarehouse().getName(),
                    t.getType(),
                    t.getType().getDisplayName(),
                    t.getQuantityChange(),
                    t.getBalanceAfter(),
                    t.getUnitPrice(),
                    t.getTransactionDate(),
                    t.getNote(),
                    t.getCreatedBy()
            );
        }
    }

    /** 현재고 한 줄 (품목 x 창고) */
    public record StockResponse(
            Long itemId,
            String itemCode,
            String itemName,
            String spec,
            String unit,
            Long warehouseId,
            String warehouseName,
            BigDecimal quantity,
            BigDecimal safetyStock,
            boolean belowSafety
    ) {
        public static StockResponse from(Stock s) {
            BigDecimal safety = s.getItem().getSafetyStock();
            boolean below = s.getQuantity().compareTo(safety) < 0;
            return new StockResponse(
                    s.getItem().getId(),
                    s.getItem().getCode(),
                    s.getItem().getName(),
                    s.getItem().getSpec(),
                    s.getItem().getUnit(),
                    s.getWarehouse().getId(),
                    s.getWarehouse().getName(),
                    s.getQuantity(),
                    safety,
                    below
            );
        }
    }
}
