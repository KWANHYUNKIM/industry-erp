package com.erp.trade.shipment;

import com.erp.trade.salesorder.SalesOrderLine;
import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import com.erp.inventory.item.Item;

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

    /**
     * 근거 출하지시서 줄. 원본 출하입력 [출하지시] 로 이어 만든 출하 — 미출하 잔량이 이 줄들의 합만큼 준다.
     * 출하지시서를 지우면 비워진다(원본은 출하가 이어진 지시서도 지워지고 출하는 남는다).
     */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "shipment_order_line_id")
    private com.erp.trade.shipmentorder.ShipmentOrderLine shipmentOrderLine;

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
