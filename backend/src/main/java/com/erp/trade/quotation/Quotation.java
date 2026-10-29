package com.erp.trade.quotation;

import com.erp.trade.partner.BusinessPartner;
import com.erp.inventory.warehouse.Warehouse;
import com.erp.inventory.project.Project;
import com.erp.inventory.salesrep.SalesRep;
import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import com.erp.common.BaseTimeEntity;

/**
 * 견적서. 영업 흐름의 시작점(견적 → 주문 → 판매 → 수금).
 * 고객이 수락하면 수주(SalesOrder)로 전환된다.
 */
@Entity
@Table(name = "quotations")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class Quotation extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** 견적번호 (예: QT-20260713-0001) */
    @Column(name = "quote_no", nullable = false, unique = true, length = 30)
    private String quoteNo;

    @Column(name = "quote_date", nullable = false)
    private LocalDate quoteDate;

    /** 견적 유효기한 */
    @Column(name = "valid_until")
    private LocalDate validUntil;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "partner_id", nullable = false)
    private BusinessPartner partner;

    /** 저장 때 거래처명 — 임의거래처는 화면에서 고친 이름(원본 실측 2026-10-28). 옛 전표는 거래처 이름으로 백필. */
    @Column(name = "partner_name", length = 200)
    private String partnerName;

    /** 화면에 찍을 거래처명 — 전표에 남긴 이름, 없으면 거래처 마스터 이름. */
    public String displayPartnerName() {
        return partnerName != null ? partnerName : (partner != null ? partner.getName() : null);
    }

    /**
     * 원본 견적서의 [창고]. 판매전표는 이미 물고 있는데 견적만 없어서,
     * 견적 → 수주 → 판매로 이어질 때 <b>맨 앞에서 정한 창고가 중간에 끊겼다.</b>
     * 견적 시점에는 안 정했을 수 있어 nullable 이다.
     */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "warehouse_id")
    private Warehouse warehouse;

    /** 원본 견적서의 [프로젝트]. 위와 같은 까닭으로 nullable 이다. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "project_id")
    private Project project;

    /**
     * 원본 견적서의 [담당자](견적서조회 [사원(담당)명]). 주문서(SalesOrder)와 같은 방식으로 Employee 를 직접 문다.
     * 견적 시점에 안 정했을 수 있어 nullable 이다.
     */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "employee_id")
    private SalesRep employee;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    @Builder.Default
    private QuotationStatus status = QuotationStatus.IN_PROGRESS;

    @Column(name = "supply_amount", nullable = false, precision = 18, scale = 2)
    @Builder.Default
    private BigDecimal supplyAmount = BigDecimal.ZERO;

    @Column(name = "vat_amount", nullable = false, precision = 18, scale = 2)
    @Builder.Default
    private BigDecimal vatAmount = BigDecimal.ZERO;

    @Column(name = "total_amount", nullable = false, precision = 18, scale = 2)
    @Builder.Default
    private BigDecimal totalAmount = BigDecimal.ZERO;

    /** 수주 전환 시 생성된 sales_orders.id */
    @Column(name = "converted_order_id")
    private Long convertedOrderId;

    @Column(length = 500)
    private String remark;

    @Column(name = "created_by", length = 50)
    private String createdBy;

    @OneToMany(mappedBy = "quotation", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("lineNo asc")
    @Builder.Default
    private List<QuotationLine> lines = new ArrayList<>();

    public void addLine(QuotationLine line) {
        line.setQuotation(this);
        line.setLineNo(this.lines.size() + 1);
        this.lines.add(line);
    }
}
