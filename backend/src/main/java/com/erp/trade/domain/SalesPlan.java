package com.erp.trade.domain;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import com.erp.common.BaseTimeEntity;
import com.erp.inventory.domain.Item;

/**
 * 매출계획. 품목별 월 매출 목표(수량·금액).
 * 실적은 별도 저장하지 않고 판매(Sales) 집계로 대조한다(매출계획비교표).
 */
@Entity
@Table(name = "sales_plans")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class SalesPlan extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "item_id", nullable = false)
    private Item item;

    /** 계획 연도 (예: 2026) */
    @Column(name = "plan_year", nullable = false)
    private int planYear;

    /** 계획 월 (1~12) */
    @Column(name = "plan_month", nullable = false)
    private int planMonth;

    /** 계획 수량 */
    @Column(name = "plan_qty", nullable = false, precision = 18, scale = 2)
    @Builder.Default
    private BigDecimal planQty = BigDecimal.ZERO;

    /** 계획 금액 */
    @Column(name = "plan_amount", nullable = false, precision = 18, scale = 2)
    @Builder.Default
    private BigDecimal planAmount = BigDecimal.ZERO;

    @Column(length = 300)
    private String remark;

    @Column(name = "created_by", length = 50)
    private String createdBy;
}
