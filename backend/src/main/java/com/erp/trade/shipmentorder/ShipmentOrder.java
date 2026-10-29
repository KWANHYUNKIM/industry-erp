package com.erp.trade.shipmentorder;

import com.erp.common.BaseTimeEntity;
import com.erp.trade.partner.BusinessPartner;
import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

/**
 * 출하지시서(원본 E040220 · E040221). 판매/주문 → <b>출하지시서</b> → 출하.
 *
 * <p>원본은 출하지시서와 출하가 다른 전표다 — 출하는 출하지시서 줄에 이어 만들고, 미출하 잔량은
 * 출하지시서 줄 수량에서 이어진 출하 수량을 뺀 것이다. 단가 · 금액은 없다(수량만).
 */
@Entity
@Table(name = "shipment_orders")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class ShipmentOrder extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** 전표번호 (예: SI-20261020-0002 → 화면 '2026/10/20 -2') */
    @Column(name = "order_no", nullable = false, unique = true, length = 30)
    private String orderNo;

    @Column(name = "order_date", nullable = false)
    private LocalDate orderDate;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "partner_id", nullable = false)
    private BusinessPartner partner;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "employee_id")
    private com.erp.inventory.salesrep.SalesRep employee;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "warehouse_id")
    private com.erp.inventory.warehouse.Warehouse warehouse;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "project_id")
    private com.erp.inventory.project.Project project;

    @Column(length = 50)
    private String contact;

    /** 출하예정일 — 원본 기본 오늘. 미출하현황의 열. */
    @Column(name = "due_date")
    private LocalDate dueDate;

    @Column(name = "postal_code", length = 10)
    private String postalCode;

    @Column(length = 255)
    private String address;

    @Column(length = 500)
    private String remark;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    @Builder.Default
    private ShipmentOrderStatus status = ShipmentOrderStatus.IN_PROGRESS;

    @Column(name = "total_quantity", nullable = false, precision = 18, scale = 2)
    @Builder.Default
    private BigDecimal totalQuantity = BigDecimal.ZERO;

    @Column(name = "created_by", length = 50)
    private String createdBy;

    @OneToMany(mappedBy = "shipmentOrder", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("id")
    @Builder.Default
    private List<ShipmentOrderLine> lines = new ArrayList<>();

    public void addLine(ShipmentOrderLine line) {
        line.setShipmentOrder(this);
        this.lines.add(line);
    }
}
