package com.erp.trade.domain;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import com.erp.inventory.domain.Item;

/** 주문서 명세(품목 단위 라인). */
@Entity
@Table(name = "sales_order_lines")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class SalesOrderLine {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "sales_order_id", nullable = false)
    private SalesOrder salesOrder;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "item_id", nullable = false)
    private Item item;

    @Column(nullable = false, precision = 18, scale = 2)
    private BigDecimal quantity;

    /** 누적 출하수량(부분출하 추적). quantity 도달 시 완납. */
    @Column(nullable = false, precision = 18, scale = 2)
    @Builder.Default
    private BigDecimal shippedQty = BigDecimal.ZERO;

    @Column(nullable = false, precision = 18, scale = 2)
    private BigDecimal unitPrice;

    @Column(nullable = false, precision = 18, scale = 2)
    private BigDecimal supplyAmount;

    @Column(nullable = false, precision = 18, scale = 2)
    private BigDecimal vatAmount;
}
