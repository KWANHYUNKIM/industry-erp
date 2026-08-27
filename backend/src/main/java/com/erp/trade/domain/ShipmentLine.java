package com.erp.trade.domain;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import com.erp.inventory.domain.Item;

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

    /**
     * 줄 적요 — 원본 출하지시서입력 그리드의 마지막 열이고,
     * 출하지시서현황·출하현황의 결과 열이기도 하다.
     *
     * <p>전표 적요만으로는 "이 품목만 왜 따로 보내는지" 를 적을 자리가 없다.
     * 판매·구매·생산불출 라인은 이미 다 들고 있다.
     */
    @Column(length = 255)
    private String remark;
}
