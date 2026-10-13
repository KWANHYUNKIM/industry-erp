package com.erp.trade.price;

import com.erp.common.BaseTimeEntity;
import com.erp.inventory.item.Item;
import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;

/**
 * 품목별 특별단가(원본 E040124 [품목별] 알약 · '품목별특별단가등록' 창): 특별단가그룹 × 품목 = 적용단가 · VAT포함.
 * 한 그룹에 품목은 한 번 — 또 넣으면 원본 '이미 특별단가그룹에 존재하는 코드입니다.'
 */
@Entity
@Table(name = "special_prices")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class SpecialPrice extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "group_id", nullable = false)
    private SpecialPriceGroup group;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "item_id", nullable = false)
    private Item item;

    /** 적용단가 */
    @Column(name = "unit_price", nullable = false, precision = 18, scale = 2)
    @Builder.Default
    private BigDecimal unitPrice = BigDecimal.ZERO;

    /** VAT포함 */
    @Column(name = "vat_included", nullable = false)
    private boolean vatIncluded;

    @Column(nullable = false)
    @Builder.Default
    private boolean active = true;

    @Column(length = 300)
    private String remark;

    @Column(name = "created_by", length = 50)
    private String createdBy;
}
