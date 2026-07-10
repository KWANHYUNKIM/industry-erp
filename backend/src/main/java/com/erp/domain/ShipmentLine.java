package com.erp.domain;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;

/** 출하 명세(품목 단위 라인). */
@Entity
@Table(name = "shipment_lines")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class ShipmentLine {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "shipment_id", nullable = false)
    private Shipment shipment;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "item_id", nullable = false)
    private Item item;

    /** 근거 주문 라인. 주문 없이 직접 등록한 출하는 null. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "order_line_id")
    private SalesOrderLine orderLine;

    @Column(nullable = false, precision = 18, scale = 2)
    private BigDecimal quantity;

    @Column(nullable = false, precision = 18, scale = 2)
    private BigDecimal unitPrice;

    @Column(nullable = false, precision = 18, scale = 2)
    private BigDecimal amount;
}
