package com.erp.trade.shipmentorder;

import com.erp.inventory.item.Item;
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
}
