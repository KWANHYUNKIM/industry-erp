package com.erp.inventory.dto;

import com.erp.inventory.domain.Stock;
import com.erp.inventory.domain.StockTransaction;
import com.erp.inventory.domain.StockTransactionType;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

public final class StockDtos {

    private StockDtos() {}

    /**
     * 재고수불부 응답. {@code opening}은 기간 시작 직전의 재고(품목·창고를 모두 특정했을 때만 산출,
     * 그 외에는 null)이며, 화면은 이 값에 각 행의 변동량을 누적해 잔량을 <b>표시순서대로 재계산</b>한다.
     * 저장된 balanceAfter는 입력(id)순 기준이라 일자정렬 화면에서 그대로 쓰면 어긋나기 때문이다.
     */
    public record StockLedgerResponse(
            BigDecimal opening,
            List<StockTransactionResponse> rows
    ) {}

    /** 재고변동표 한 행 — 품목별 기초·입고·출고·기말(기말 = 기초 + 입고 − 출고). */
    public record StockMovementRow(
            Long itemId, String itemCode, String itemName, String unit,
            BigDecimal opening, BigDecimal inQty, BigDecimal outQty, BigDecimal closing
    ) {}

    /**
     * 잔량재집계 한 행 — (품목,창고) 조합의 점검 결과.
     *
     * {@code storedQuantity} 는 잔량 테이블(stocks)에 들어 있는 값, {@code computedQuantity} 는
     * 수불 이력 전체를 더한 값이다. 둘이 다르면 어딘가에서 이력 없이 잔량이 바뀐 것이다.
     * {@code balanceMismatch} 는 기간 안에서 거래별 잔량(balanceAfter)이 일자순 누적과 어긋난 건수다
     * (과거 일자 거래가 뒤늦게 입력되면 입력순으로 매겨진 저장값이 일자순 잔량과 달라진다).
     */
    public record StockRecalcRow(
            Long itemId, String itemCode, String itemName,
            Long warehouseId, String warehouseCode, String warehouseName,
            BigDecimal opening, int txCount, int balanceMismatch,
            BigDecimal storedQuantity, BigDecimal computedQuantity, BigDecimal difference
    ) {}

    /** 잔량재집계 결과. applied=false 면 점검만 한 것(값을 고치지 않았다). */
    public record StockRecalcResult(
            String fromMonth, String toMonth,
            boolean applied,
            int scannedTx, int balanceMismatch, int quantityMismatch,
            List<StockRecalcRow> rows
    ) {}

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
