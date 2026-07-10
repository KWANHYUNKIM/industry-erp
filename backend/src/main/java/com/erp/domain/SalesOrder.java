package com.erp.domain;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

/**
 * 주문서(수주). 매출처로부터 받은 주문. 판매입력의 전 단계(미판매 관리).
 * 재고/채권 이동 없음 — 실제 출고는 판매입력에서.
 */
@Entity
@Table(name = "sales_orders")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class SalesOrder extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** 주문번호 (예: SN-20260707-0001) */
    @Column(nullable = false, unique = true, length = 30)
    private String orderNo;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "partner_id", nullable = false)
    private BusinessPartner partner;

    @Column(nullable = false)
    private LocalDate orderDate;

    /** 납기일자 */
    private LocalDate dueDate;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    @Builder.Default
    private SalesOrderStatus status = SalesOrderStatus.RECEIVED;

    /** 오더 진행단계 (접수→견적→수주확정→생산→출하). 미지정 허용. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "stage_id")
    private OrderStage stage;

    /** 오더 유형 (일반수주/견적/샘플/긴급/정기납품). 미지정 허용. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "order_type_id")
    private OrderType orderType;

    @Column(nullable = false, precision = 18, scale = 2)
    @Builder.Default
    private BigDecimal supplyAmount = BigDecimal.ZERO;

    @Column(nullable = false, precision = 18, scale = 2)
    @Builder.Default
    private BigDecimal vatAmount = BigDecimal.ZERO;

    @Column(nullable = false, precision = 18, scale = 2)
    @Builder.Default
    private BigDecimal totalAmount = BigDecimal.ZERO;

    @Column(length = 500)
    private String remark;

    @Column(length = 50)
    private String createdBy;

    @OneToMany(mappedBy = "salesOrder", cascade = CascadeType.ALL, orphanRemoval = true)
    @Builder.Default
    private List<SalesOrderLine> lines = new ArrayList<>();

    public void addLine(SalesOrderLine line) {
        line.setSalesOrder(this);
        this.lines.add(line);
    }
}
