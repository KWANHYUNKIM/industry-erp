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

    /**
     * 줄 규격. 원본은 전표 줄의 [규격] 을 줄마다 따로 저장한다 — 품목을 고르면 품목 규격으로 채워지지만
     * 줄에서 고치거나 비울 수 있고, 저장된 값이 그대로 보인다. 비어 있으면(null) 품목 규격으로 본다. 빈 글자("")는 일부러 비운 것이다.
     */
    @Column(name = "spec", length = 200)
    private String spec;

    /** 화면에 보일 규격 — 줄에 저장된 값, 저장 전 옛 줄(null)이면 품목 규격. */
    public String effectiveSpec() {
        return spec != null ? spec : (getItem() == null ? null : getItem().getSpec());
    }
}
