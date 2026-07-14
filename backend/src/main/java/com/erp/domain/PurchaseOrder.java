package com.erp.domain;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

/**
 * 발주서. 구매 흐름의 시작점(발주요청 → 발주계획 → 단가확정 → 발주확정 → 구매입고).
 * 매입처에 발주를 내고, 물품이 도착하면 구매전표(Purchase)로 전환되며 그때 재고가 증가한다.
 * 발주 단계에서는 재고를 건드리지 않는다.
 */
@Entity
@Table(name = "purchase_orders")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class PurchaseOrder extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** 발주번호 (예: PR-20260714-0001). 구매전표(PO-)와 접두어가 다르다. */
    @Column(name = "order_no", nullable = false, unique = true, length = 30)
    private String orderNo;

    @Column(name = "order_date", nullable = false)
    private LocalDate orderDate;

    /** 납기 요청일 */
    @Column(name = "due_date")
    private LocalDate dueDate;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "partner_id", nullable = false)
    private BusinessPartner partner;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    @Builder.Default
    private PurchaseOrderStatus status = PurchaseOrderStatus.REQUESTED;

    @Column(name = "supply_amount", nullable = false, precision = 18, scale = 2)
    @Builder.Default
    private BigDecimal supplyAmount = BigDecimal.ZERO;

    @Column(name = "vat_amount", nullable = false, precision = 18, scale = 2)
    @Builder.Default
    private BigDecimal vatAmount = BigDecimal.ZERO;

    @Column(name = "total_amount", nullable = false, precision = 18, scale = 2)
    @Builder.Default
    private BigDecimal totalAmount = BigDecimal.ZERO;

    /** 과세 여부. 단가 확정 시 부가세를 다시 계산해야 해서 전표에 남긴다. */
    @Column(nullable = false)
    @Builder.Default
    private Boolean taxable = true;

    /** 입고 전환 시 생성된 purchases.id */
    @Column(name = "converted_purchase_id")
    private Long convertedPurchaseId;

    @Column(length = 500)
    private String remark;

    @Column(name = "created_by", length = 50)
    private String createdBy;

    @OneToMany(mappedBy = "purchaseOrder", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("lineNo asc")
    @Builder.Default
    private List<PurchaseOrderLine> lines = new ArrayList<>();

    public void addLine(PurchaseOrderLine line) {
        line.setPurchaseOrder(this);
        line.setLineNo(this.lines.size() + 1);
        this.lines.add(line);
    }
}
