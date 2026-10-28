package com.erp.trade.shipmentorder;

import com.erp.inventory.item.Item;
import com.erp.trade.sales.Sales;
import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;

/** 출하지시서 줄 — 원본 격자 품목코드 · 품목명 · 규격 · 수량(단가 · 금액 없음). */
@Entity
@Table(name = "shipment_order_lines")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class ShipmentOrderLine {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "shipment_order_id", nullable = false)
    private ShipmentOrder shipmentOrder;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "item_id", nullable = false)
    private Item item;

    @Column(nullable = false, precision = 18, scale = 2)
    private BigDecimal quantity;

    @Column(length = 255)
    private String remark;

    /** 출하지시서입력 [판매] 로 담은 판매(원본 '판매검색창') — 판매검색창은 출하지시서가 안 걸린 판매만 보인다. 없으면 null. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "sales_id")
    private Sales sales;
}
