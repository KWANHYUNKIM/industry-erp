package com.erp.trade.domain;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import com.erp.common.BaseTimeEntity;

/**
 * 출하. 매출처로 실제 반출되는 물품 지시/처리.
 * 출하지시(READY) → 출하완료(SHIPPED). 미출하현황 = READY 상태의 출하.
 */
@Entity
@Table(name = "shipments")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class Shipment extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** 출하번호 (예: SH-20260707-0001) */
    @Column(nullable = false, unique = true, length = 30)
    private String shipNo;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "partner_id", nullable = false)
    private BusinessPartner partner;

    /** 근거 주문(수주). 주문 없이 직접 등록한 출하는 null. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "sales_order_id")
    private SalesOrder salesOrder;

    @Column(nullable = false)
    private LocalDate shipDate;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    @Builder.Default
    private ShipmentStatus status = ShipmentStatus.READY;

    @Column(nullable = false, precision = 18, scale = 2)
    @Builder.Default
    private BigDecimal totalQuantity = BigDecimal.ZERO;

    @Column(nullable = false, precision = 18, scale = 2)
    @Builder.Default
    private BigDecimal totalAmount = BigDecimal.ZERO;

    /**
     * 출하예정일. 원본 출하지시서입력의 [출하예정일] 이고, 미출하현황의 조건이기도 하다 —
     * 조건은 있는데 값이 없어서 그 조건으로는 아무것도 못 걸렀다.
     */
    @Column(name = "due_date")
    private java.time.LocalDate dueDate;

    /** 출하창고. 어느 창고에서 빼는지. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "warehouse_id")
    private com.erp.inventory.domain.Warehouse warehouse;

    /** 담당자 */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "employee_id")
    private com.erp.hr.domain.Employee employee;

    /**
     * 배송지 — 연락처·우편번호·주소.
     *
     * <p>거래처 주소와 <b>다른 곳으로 보내는 경우가 흔하다.</b> 적을 자리가 없으면
     * 적요에 손으로 적게 되고, 그러면 아무 화면도 그걸 배송지로 알아보지 못한다.
     */
    @Column(length = 50)
    private String contact;

    @Column(name = "postal_code", length = 10)
    private String postalCode;

    @Column(length = 255)
    private String address;

    @Column(length = 500)
    private String remark;

    /**
     * 귀속 프로젝트. 판매·구매·비용은 진작 다는데 여기만 없었다.
     *
     * <p>프로젝트별 손익을 집계하려면 <b>돈이 들어오고 나가는 전표</b>가 프로젝트를 알아야 한다.
     * 안 정할 수도 있다 — 프로젝트를 안 쓰는 회사도 있고, 프로젝트에 안 묶이는 거래도 있다.
     */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "project_id")
    private com.erp.inventory.domain.Project project;

    @Column(length = 50)
    private String createdBy;

    @OneToMany(mappedBy = "shipment", cascade = CascadeType.ALL, orphanRemoval = true)
    @Builder.Default
    private List<ShipmentLine> lines = new ArrayList<>();

    public void addLine(ShipmentLine line) {
        line.setShipment(this);
        this.lines.add(line);
    }
}
