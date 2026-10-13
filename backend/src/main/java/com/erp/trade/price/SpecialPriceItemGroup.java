package com.erp.trade.price;

import com.erp.common.BaseTimeEntity;
import com.erp.inventory.item.ItemGroup;
import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;

/**
 * 품목그룹별 특별단가(원본 E040124 [품목그룹별] 알약 · '품목그룹추가' 창):
 * 특별단가그룹 × 품목그룹 = 단가기준(출고단가 · 입고단가) × (100 + 조정_비율) / 100 을 조정_단위처리로 맞춘 값.
 */
@Entity
@Table(name = "special_price_item_groups")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class SpecialPriceItemGroup extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "group_id", nullable = false)
    private SpecialPriceGroup group;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "item_group_id", nullable = false)
    private ItemGroup itemGroup;

    /** 단가기준 — '출고단가' · '입고단가' */
    @Column(name = "price_basis", nullable = false, length = 20)
    private String priceBasis;

    /** 조정_비율(%) — 음수면 할인 */
    @Column(name = "adjust_rate", nullable = false, precision = 9, scale = 4)
    @Builder.Default
    private BigDecimal adjustRate = BigDecimal.ZERO;

    /** 조정_단위처리 앞 칸 — '소수0자리미만' 꼴 */
    @Column(name = "round_unit", nullable = false, length = 20)
    private String roundUnit;

    /** 조정_단위처리 뒤 칸 — 반올림 · 절사 · 절상 */
    @Column(name = "round_mode", nullable = false, length = 10)
    private String roundMode;

    @Column(nullable = false)
    @Builder.Default
    private boolean active = true;

    @Column(name = "created_by", length = 50)
    private String createdBy;
}
