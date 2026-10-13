package com.erp.trade.purchaseorder;

import com.erp.trade.partner.BusinessPartner;
import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import com.erp.inventory.item.Item;

/** 발주서 명세(품목 라인). 발주요청 시점에는 단가가 0일 수 있고, 단가확정 단계에서 채운다. */
@Entity
@Table(name = "purchase_order_lines")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class PurchaseOrderLine {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "purchase_order_id", nullable = false)
    private PurchaseOrder purchaseOrder;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "item_id", nullable = false)
    private Item item;

    /** 라인 거래처 (헤더 매입처와 다를 수 있음) */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "partner_id")
    private BusinessPartner partner;

    /** 적요 */
    @Column(length = 200)
    private String remark;

    @Column(nullable = false, precision = 18, scale = 2)
    private BigDecimal quantity;

    @Column(name = "unit_price", nullable = false, precision = 18, scale = 2)
    @Builder.Default
    private BigDecimal unitPrice = BigDecimal.ZERO;

    @Column(name = "supply_amount", nullable = false, precision = 18, scale = 2)
    @Builder.Default
    private BigDecimal supplyAmount = BigDecimal.ZERO;

    @Column(name = "vat_amount", nullable = false, precision = 18, scale = 2)
    @Builder.Default
    private BigDecimal vatAmount = BigDecimal.ZERO;

    /**
     * 발주계획 [종결여부] — 원본 발주계획조회(C000076)는 계획을 <b>줄마다</b> 종결한다(2026-10-13 실측).
     * 종결한 줄은 완료 탭으로 가고 주황 '취소' 로 되돌린다. 발주 흐름 상태(PurchaseOrderStatus)와 따로 간다.
     */
    @Column(name = "plan_closed", nullable = false)
    @Builder.Default
    private boolean planClosed = false;

    /**
     * 처음 넣은 수량 — 원본 [수량조정] 창의 [입력수량]. 격자에서 수량을 고쳐도(그것은 [발주확정수량]) 이 값은 그대로다.
     * 계산식의 출발점이다(입력수량 + 안전재고 + 미판매 + 미불출 − 보유재고 − 미입고).
     */
    @Column(name = "input_quantity", precision = 18, scale = 2)
    private BigDecimal inputQuantity;

    /** 원본 [수량조정] 창의 [최종계산일자] — 처음엔 전표 일자, [수량조정] 을 저장할 때마다 그날. */
    @Column(name = "plan_calc_date")
    private java.time.LocalDate planCalcDate;

    @Column(name = "line_no", nullable = false)
    @Builder.Default
    private Integer lineNo = 1;
}
