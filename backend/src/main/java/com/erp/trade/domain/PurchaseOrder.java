package com.erp.trade.domain;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import com.erp.common.BaseTimeEntity;
import com.erp.hr.domain.Employee;
import com.erp.inventory.domain.Project;
import com.erp.inventory.domain.Warehouse;

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

    /**
     * 회신받은 <b>단가의 유효기간</b>. 원본 단가요청진행단계의 [유효기간] 이다.
     *
     * <p>납기일(dueDate)과 <b>다른 것</b>이다. 납기는 물건이 언제 오느냐이고 이것은
     * 그 값이 언제까지 유효하냐다. 안 적어 두면 지난 단가로 발주를 확정해도 아무 말이
     * 없어, 물건이 들어오고 청구서가 와서야 값이 다른 것을 안다.
     *
     * <p>안 정할 수도 있다 — 유효기간을 안 다는 거래처도 있고, 단가를 아직 안 받은 요청도 있다.
     */
    @Column(name = "price_valid_until")
    private LocalDate priceValidUntil;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "partner_id", nullable = false)
    private BusinessPartner partner;

    /** 담당자 */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "employee_id")
    private Employee employee;

    /** 입고예정 창고 */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "warehouse_id")
    private Warehouse warehouse;

    /**
     * 원본 발주서의 [프로젝트]. 프로젝트별 손익은 판매·구매·비용 전표를 프로젝트로 모아 내는데
     * <b>발주 단계가 빠져</b> 어느 프로젝트로 주문한 것인지 입고된 뒤에야 알 수 있었다.
     * 발주 시점에는 안 정했을 수 있어 nullable 이다.
     */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "project_id")
    private Project project;

    /** 통화 코드 (내자=KRW, 외화=USD 등) */
    @Column(nullable = false, length = 10)
    @Builder.Default
    private String currency = "KRW";

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
