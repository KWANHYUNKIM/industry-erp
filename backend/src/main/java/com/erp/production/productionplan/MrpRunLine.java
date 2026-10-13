package com.erp.production.productionplan;

import com.erp.inventory.item.Item;
import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * 생산계획/MRP 계산 결과 한 줄 — 품목 · 필요일마다(계획이 없는 품목은 필요일 없이 한 줄).
 * 원본 생산계획리스트(수정)의 열: 전일재고 · 안전재고 · 최소증가단위 · 감소예정 · 증가예정 · 생산계획수량.
 * calcQty 는 계산이 낸 값, planQty 는 [수정] 으로 고친 값이다(처음엔 같다).
 */
@Entity
@Table(name = "mrp_run_lines")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class MrpRunLine {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "run_id", nullable = false)
    private MrpRun run;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 10)
    private MrpRunKind kind;

    @Column(name = "line_no", nullable = false)
    private Integer lineNo;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "item_id", nullable = false)
    private Item item;

    /** 계획수량이 필요한 날(받는 날). 계획이 없는 품목은 null. */
    @Column(name = "need_date")
    private LocalDate needDate;

    @Column(name = "prev_stock", nullable = false, precision = 18, scale = 4)
    private BigDecimal prevStock;

    @Column(name = "safety_stock", nullable = false, precision = 18, scale = 4)
    private BigDecimal safetyStock;

    @Column(name = "min_unit", nullable = false, precision = 18, scale = 4)
    private BigDecimal minUnit;

    @Column(name = "lead_time_days")
    private Integer leadTimeDays;

    /** 기간 동안(계획기간이전 포함) 줄어들 양 — 출고예정 + 소모예정. */
    @Column(name = "decrease_qty", nullable = false, precision = 18, scale = 4)
    private BigDecimal decreaseQty;

    /** 기간 동안 늘어날 양 — 입고예정 + 생산예정. */
    @Column(name = "increase_qty", nullable = false, precision = 18, scale = 4)
    private BigDecimal increaseQty;

    @Column(name = "calc_qty", nullable = false, precision = 18, scale = 4)
    private BigDecimal calcQty;

    @Column(name = "plan_qty", nullable = false, precision = 18, scale = 4)
    private BigDecimal planQty;

    /** 품목의 주거래처(매입처) id — MRP 줄을 발주로 넘길 때. trade 엔티티를 붙들지 않고 id 만 든다. */
    @Column(name = "supplier_id")
    private Long supplierId;
}
