package com.erp.trade.domain;

import com.erp.trade.domain.enums.ExportStatus;
import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import com.erp.accounting.domain.Currency;
import com.erp.common.BaseTimeEntity;

/**
 * 수출 오더(Invoice). 외화로 팔고 원화로 장부에 남긴다.
 *
 * 금액은 외화가 원본이고, 원화는 인보이스 발행일의 고시환율로 환산해 함께 박아둔다.
 * 환율은 매일 바뀌므로 "볼 때 환산"하면 어제 본 금액과 오늘 본 금액이 달라진다 —
 * 수출 인보이스는 발행 시점 환율로 고정되어야 세관·회계와 맞는다.
 */
@Entity
@Table(name = "export_orders")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class ExportOrder extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** 인보이스 번호 (예: INV-20260714-0001) */
    @Column(name = "invoice_no", nullable = false, unique = true, length = 30)
    private String invoiceNo;

    @Column(name = "invoice_date", nullable = false)
    private LocalDate invoiceDate;

    /** 수입자(Buyer) */
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "partner_id", nullable = false)
    private BusinessPartner buyer;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "currency_id", nullable = false)
    private Currency currency;

    /** 외화 합계 */
    @Column(name = "foreign_amount", nullable = false, precision = 18, scale = 2)
    private BigDecimal foreignAmount;

    /** 인보이스 발행일에 적용한 고시환율 */
    @Column(name = "applied_rate", nullable = false, precision = 18, scale = 4)
    private BigDecimal appliedRate;

    /** 원화 환산액 (외화 × 고시환율 / 고시단위) */
    @Column(name = "krw_amount", nullable = false, precision = 18, scale = 2)
    private BigDecimal krwAmount;

    /** 가격조건 (FOB / CIF / EXW …) */
    @Column(length = 20)
    private String incoterms;

    /** 도착지 (국가·항구) */
    @Column(length = 100)
    private String destination;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    @Builder.Default
    private ExportStatus status = ExportStatus.ORDER;

    /** 수출신고번호 (통관진행 시 기록) */
    @Column(name = "declaration_no", length = 50)
    private String declarationNo;

    /** 선하증권(B/L) 번호 (선적완료 시 기록) */
    @Column(name = "bl_no", length = 50)
    private String blNo;

    @Column(name = "shipped_date")
    private LocalDate shippedDate;

    @Column(name = "paid_date")
    private LocalDate paidDate;

    @Column(length = 300)
    private String remark;

    @Column(name = "created_by", length = 50)
    private String createdBy;

    @OneToMany(mappedBy = "exportOrder", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("lineNo asc")
    @Builder.Default
    private List<ExportOrderLine> lines = new ArrayList<>();

    public void addLine(ExportOrderLine line) {
        line.setExportOrder(this);
        line.setLineNo(this.lines.size() + 1);
        this.lines.add(line);
    }
}
