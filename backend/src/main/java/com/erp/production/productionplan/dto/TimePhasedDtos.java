package com.erp.production.productionplan.dto;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

/**
 * 원본 <b>생산계획현황 · MRP현황</b>(생산계획/MRP생성 → 현황)의 날짜별 표.
 *
 * <p>품목 하나에 줄이 여덟이다: 기초재고 · 입고예정량 · 생산예정량 · 출고예정량 · 소모예정량 · 예상재고 ·
 * 필요수량 · 계획수량. 열은 [계획기간이전] 과 기간의 날마다다(2026-10-02 loginaa 실측).
 */
public final class TimePhasedDtos {

    private TimePhasedDtos() {}

    /** 하루 칸. 기초재고 = 전날 예상재고. 예상재고 = 기초 + 입고 + 생산 + 계획 − 출고 − 소모. */
    public record Cell(
            BigDecimal opening, BigDecimal inQty, BigDecimal prodQty, BigDecimal outQty, BigDecimal consumeQty,
            BigDecimal expected, BigDecimal needQty, BigDecimal planQty
    ) {}

    public record Row(
            Long itemId, String itemCode, String itemName, String spec, String unit,
            /** 생산할 품목(BOM 있음)인가 — 아니면 사들이는 자재다(MRP 쪽). */
            boolean producible,
            BigDecimal safetyStock, BigDecimal minUnit, Integer leadTimeDays,
            /** 품목의 주거래처(매입처) — MRP 구매계획으로 발주요청을 만들 때 쓴다. */
            Long supplierId,
            /** 전일재고 — 기간 첫날 전날의 재고(전 창고 합). */
            BigDecimal prevStock,
            /** [계획기간이전] — 기간 전에 잡혀 있었는데 아직 안 끝난 입고·생산·출고·소모. */
            Cell before,
            List<Cell> days
    ) {}

    public record Result(LocalDate from, LocalDate to, List<LocalDate> days, List<Row> rows) {}
}
