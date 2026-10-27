package com.erp.accounting.cost;

import com.erp.common.BaseTimeEntity;
import com.erp.inventory.item.Item;
import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;

/**
 * 원가생성/수정(E040802) <b>원가계산내역</b>의 한 줄 — 한 원가 기간의 한 품목.
 *
 * <p>2026-10-13 loginaa 실측: 열 [품목코드 · 품목명[규격] · 품목구분 · 생산공정명 · 기초 · 증가 · 감소 · 기말](각 수량 · 단가 · 금액).
 * 단가는 따로 두지 않는다 — 원본 기초 4,109,476,075 ÷ 12,155 = 338,089.35 를 338,089 로 찍듯 금액 ÷ 수량을 버림해 보인다.
 * 증가는 원가수정 창에서 구매 · 생산입고 · 노무비 · 경비 · 외주비 · 조정/대체/반품 여섯 줄로 나뉜다.
 *
 * <p>{@code decreaseAmount} · {@code closingAmount} 가 null 이면 '자동계산' — 원가수정으로 값을 고친 뒤
 * [기말금액재계산] 을 아직 안 한 상태다(원본도 고치는 순간 감소 · 기말 단가 · 금액 칸이 '자동계산' 으로 바뀐다).
 */
@Entity
@Table(name = "cost_ledgers", uniqueConstraints = {
        @UniqueConstraint(name = "uk_cost_ledgers_period_item", columnNames = {"cost_period_id", "item_id"})
})
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class CostLedger extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "cost_period_id", nullable = false)
    private CostPeriod period;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "item_id", nullable = false)
    private Item item;

    @Column(name = "opening_qty", nullable = false, precision = 18, scale = 2)
    @Builder.Default private BigDecimal openingQty = BigDecimal.ZERO;
    @Column(name = "opening_amount", nullable = false, precision = 18, scale = 2)
    @Builder.Default private BigDecimal openingAmount = BigDecimal.ZERO;

    @Column(name = "purchase_qty", nullable = false, precision = 18, scale = 2)
    @Builder.Default private BigDecimal purchaseQty = BigDecimal.ZERO;
    @Column(name = "purchase_amount", nullable = false, precision = 18, scale = 2)
    @Builder.Default private BigDecimal purchaseAmount = BigDecimal.ZERO;

    @Column(name = "production_qty", nullable = false, precision = 18, scale = 2)
    @Builder.Default private BigDecimal productionQty = BigDecimal.ZERO;
    @Column(name = "production_amount", nullable = false, precision = 18, scale = 2)
    @Builder.Default private BigDecimal productionAmount = BigDecimal.ZERO;

    @Column(name = "labor_amount", nullable = false, precision = 18, scale = 2)
    @Builder.Default private BigDecimal laborAmount = BigDecimal.ZERO;
    @Column(name = "overhead_amount", nullable = false, precision = 18, scale = 2)
    @Builder.Default private BigDecimal overheadAmount = BigDecimal.ZERO;

    @Column(name = "outsourcing_qty", nullable = false, precision = 18, scale = 2)
    @Builder.Default private BigDecimal outsourcingQty = BigDecimal.ZERO;
    @Column(name = "outsourcing_amount", nullable = false, precision = 18, scale = 2)
    @Builder.Default private BigDecimal outsourcingAmount = BigDecimal.ZERO;

    @Column(name = "adjust_qty", nullable = false, precision = 18, scale = 2)
    @Builder.Default private BigDecimal adjustQty = BigDecimal.ZERO;
    @Column(name = "adjust_amount", nullable = false, precision = 18, scale = 2)
    @Builder.Default private BigDecimal adjustAmount = BigDecimal.ZERO;

    @Column(name = "decrease_qty", nullable = false, precision = 18, scale = 2)
    @Builder.Default private BigDecimal decreaseQty = BigDecimal.ZERO;
    /** null = '자동계산'(아직 [기말금액재계산] 전). */
    @Column(name = "decrease_amount", precision = 18, scale = 2)
    private BigDecimal decreaseAmount;
    /** null = '자동계산'. */
    @Column(name = "closing_amount", precision = 18, scale = 2)
    private BigDecimal closingAmount;

    public BigDecimal increaseQty() {
        return purchaseQty.add(productionQty).add(outsourcingQty).add(adjustQty);
    }

    public BigDecimal increaseAmount() {
        return purchaseAmount.add(productionAmount).add(laborAmount).add(overheadAmount)
                .add(outsourcingAmount).add(adjustAmount);
    }

    public BigDecimal closingQty() {
        return openingQty.add(increaseQty()).subtract(decreaseQty);
    }

    /**
     * 총평균 — 감소 단가 = (기초금액 + 증가금액) ÷ (기초수량 + 증가수량), 감소금액 = 감소수량 × 그 단가(원 단위 반올림),
     * 기말금액 = 기초 + 증가 − 감소. 원본 A001 로 맞춰 봤다: 350,981,017 ÷ 12,707 = 27,621.076… × 186 = 5,137,520,
     * 기말 350,981,017 − 5,137,520 = 345,843,497.
     */
    public void recalcTotalAverage() {
        BigDecimal qty = openingQty.add(increaseQty());
        BigDecimal amt = openingAmount.add(increaseAmount());
        BigDecimal dec = BigDecimal.ZERO;
        if (decreaseQty.signum() != 0 && qty.signum() > 0) {
            dec = amt.multiply(decreaseQty).divide(qty, 0, java.math.RoundingMode.HALF_UP);
        }
        decreaseAmount = dec;
        closingAmount = amt.subtract(dec);
    }

    /** 원가수정으로 값을 고치면 감소 · 기말은 '자동계산' 이 된다. */
    public void markDirty() {
        decreaseAmount = null;
        closingAmount = null;
    }
}
