package com.erp.inventory.dto;

import com.erp.inventory.domain.Stock;
import com.erp.inventory.domain.StockTransaction;
import com.erp.inventory.domain.StockTransactionType;
import jakarta.validation.constraints.Size;
import jakarta.validation.constraints.PositiveOrZero;
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
    /**
     * 재고수불부 응답.
     *
     * <p><b>줄이 너무 많으면 앞부분만 준다.</b> 이 화면은 기본 기간(전월+금월)만으로도
     * 6만 4천 줄이 나와서, 열 때마다 그만큼을 만들어 내려보내고 있었다(전 기간이면 12만 줄·34MB).
     * 원본도 큰 결과를 그냥 주지 않는다 — 조회 화면 139곳에 <b>[오천건이상조회]</b> 버튼을 두고
     * 그 위로는 눌러야 가게 한다(사본 실측). 같은 방식으로 자른다.
     *
     * @param totalRows 조건에 걸린 <b>전체</b> 줄 수. 잘렸는지와 얼마나 잘렸는지를 화면이 알아야
     *                  "5천 줄만 보여 주는 중" 이라고 말할 수 있다.
     * @param truncated 잘라서 준 것인가. 화면은 이때만 [오천건이상조회] 를 띄운다.
     */
    public record StockLedgerResponse(
            BigDecimal opening,
            List<StockTransactionResponse> rows,
            long totalRows,
            boolean truncated
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
            @NotNull(message = "수량을 입력하세요.") @Positive(message = "수량은 0보다 커야 합니다.") BigDecimal quantity,
            /** ADJUST 시 증가(true)/감소(false). INBOUND/OUTBOUND 에서는 무시 */
            Boolean increase,
            @PositiveOrZero(message = "단가는 0 이상이어야 합니다.")
            BigDecimal unitPrice,
            LocalDate transactionDate,
            @Size(max = 500, message = "입력한 글자가 너무 깁니다. 500자까지 넣을 수 있습니다.")
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

        /**
         * <b>그 시점의 재고</b>로 만든다. 수량만 바꾸고 나머지는 같다.
         *
         * <p>안전재고 미달 표시도 <b>그 시점 수량으로</b> 다시 잰다 — 현재고로 재면
         * 지금은 모자란데 그때는 넉넉했던 품목이 빨갛게 뜬다.
         */
        public static StockResponse asOf(Stock s, BigDecimal quantity) {
            BigDecimal safety = s.getItem().getSafetyStock();
            return new StockResponse(
                    s.getItem().getId(),
                    s.getItem().getCode(),
                    s.getItem().getName(),
                    s.getItem().getSpec(),
                    s.getItem().getUnit(),
                    s.getWarehouse().getId(),
                    s.getWarehouse().getName(),
                    quantity,
                    safety,
                    quantity.compareTo(safety) < 0
            );
        }
    }
}
