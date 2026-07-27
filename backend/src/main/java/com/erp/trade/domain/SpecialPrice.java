package com.erp.trade.domain;

import com.erp.common.BaseTimeEntity;
import com.erp.inventory.domain.Item;
import com.erp.trade.domain.enums.SpecialPriceType;
import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;

/**
 * 특별단가(E040124). 표준단가(Item.unitPrice)를 덮어쓰는 예외 단가.
 * 적용 범위는 <b>거래처별</b>(partner 지정) <b>또는</b> <b>특별단가그룹별</b>(priceGroup 지정) 중 하나다.
 * (거래처특별단가그룹등록 E040120 에서 각 거래처가 어느 그룹인지 지정하고, 여기서 그 그룹의 실단가를 등록한다.)
 * 실제 판매/구매 단가 자동적용은 별도 트랙 — 여기서는 마스터 등록과 유효단가 해석(resolve)만 소유한다.
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

    /** 판매/구매 구분 */
    @Enumerated(EnumType.STRING)
    @Column(name = "trade_type", nullable = false, length = 20)
    private SpecialPriceType tradeType;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "item_id", nullable = false)
    private Item item;

    /** 거래처별 특별단가일 때만 지정(그룹별이면 null) */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "partner_id")
    private BusinessPartner partner;

    /** 특별단가그룹별일 때만 지정(거래처별이면 null) */
    @Column(name = "price_group", length = 50)
    private String priceGroup;

    /** 특별단가 */
    @Column(name = "unit_price", nullable = false, precision = 18, scale = 2)
    @Builder.Default
    private BigDecimal unitPrice = BigDecimal.ZERO;

    /** 사용여부(사용중단=false) */
    @Column(nullable = false)
    @Builder.Default
    private boolean active = true;

    @Column(length = 300)
    private String remark;

    @Column(name = "created_by", length = 50)
    private String createdBy;
}
