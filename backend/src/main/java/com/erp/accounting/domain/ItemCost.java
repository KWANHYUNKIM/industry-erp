package com.erp.accounting.domain;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import com.erp.common.BaseTimeEntity;
import com.erp.inventory.domain.Item;

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
