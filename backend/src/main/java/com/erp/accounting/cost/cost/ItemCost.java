package com.erp.accounting.cost.cost;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import com.erp.common.BaseTimeEntity;
import com.erp.inventory.item.Item;

/**
 * 품목별 원가(표준/실제). (회계 &gt; 원가관리)
 * 표준원가 = 재료비/노무비/제조경비, 실제원가 = actual*.
 * 하나의 품목은 기간(period)당 1개 원가행을 가진다.
 */
@Entity
@Table(name = "item_costs", uniqueConstraints = {
        @UniqueConstraint(name = "uk_item_cost_item_period", columnNames = {"item_id", "period"})
})
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class ItemCost extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** 원가 대상 품목 */
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "item_id", nullable = false)
    private Item item;

    /** 원가 적용기간 (예: 2026-01) */
    @Column(nullable = false, length = 10)
    private String period;

    // ===== 표준원가 =====
    @Column(nullable = false, precision = 18, scale = 2)
    @Builder.Default
    private BigDecimal materialCost = BigDecimal.ZERO;

    @Column(nullable = false, precision = 18, scale = 2)
    @Builder.Default
    private BigDecimal laborCost = BigDecimal.ZERO;

    @Column(nullable = false, precision = 18, scale = 2)
    @Builder.Default
    private BigDecimal overheadCost = BigDecimal.ZERO;

    // ===== 실제원가 =====
    @Column(nullable = false, precision = 18, scale = 2)
    @Builder.Default
    private BigDecimal actualMaterial = BigDecimal.ZERO;

    @Column(nullable = false, precision = 18, scale = 2)
    @Builder.Default
    private BigDecimal actualLabor = BigDecimal.ZERO;

    @Column(nullable = false, precision = 18, scale = 2)
    @Builder.Default
    private BigDecimal actualOverhead = BigDecimal.ZERO;

    /*
     * 원가생성 [생성] 때 남기는 값(2026-10-13, V357) — 원본 [수량비교](재고수량 Checklist)의 '월별원가 기초수량',
     * [전월금액비교](금액비교 Checklist)의 '이전 월별원가 구매수량 · 구매금액', [이력]의 작업자 · 수정시간.
     * 나중에 전표를 고치면 장부와 어긋나는데, 그 어긋남을 보여 주는 것이 두 Checklist 다.
     */
    @Column(name = "opening_qty", precision = 18, scale = 2)
    private BigDecimal openingQty;

    @Column(name = "purchase_qty", precision = 18, scale = 2)
    private BigDecimal purchaseQty;

    @Column(name = "purchase_amount", precision = 18, scale = 2)
    private BigDecimal purchaseAmount;

    @Column(name = "calc_by", length = 50)
    private String calcBy;

    @Column(name = "calc_at")
    private java.time.LocalDateTime calcAt;

    /** 표준원가 합계 */
    public BigDecimal standardTotal() {
        return nz(materialCost).add(nz(laborCost)).add(nz(overheadCost));
    }

    /** 실제원가 합계 */
    public BigDecimal actualTotal() {
        return nz(actualMaterial).add(nz(actualLabor)).add(nz(actualOverhead));
    }

    /** 원가차이 = 실제 - 표준 */
    public BigDecimal variance() {
        return actualTotal().subtract(standardTotal());
    }

    private static BigDecimal nz(BigDecimal v) {
        return v != null ? v : BigDecimal.ZERO;
    }
}
