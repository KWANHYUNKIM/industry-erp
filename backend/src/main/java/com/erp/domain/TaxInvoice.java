package com.erp.domain;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * 전자(세금)계산서. 판매전표(매출) 또는 구매전표(매입)에서 발행한다.
 * 진행단계: 작성 → 발행 → 전송 → 승인.
 */
@Entity
@Table(name = "tax_invoices")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class TaxInvoice extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** 계산서번호 (예: TI-20260713-0001) */
    @Column(nullable = false, unique = true, length = 30)
    private String invoiceNo;

    @Enumerated(EnumType.STRING)
    @Column(name = "invoice_type", nullable = false, length = 20)
    private TaxInvoiceType invoiceType;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    @Builder.Default
    private TaxInvoiceStatus status = TaxInvoiceStatus.DRAFT;

    @Column(nullable = false)
    private LocalDate issueDate;

    /** 공급받는자(매출) 또는 공급자(매입) 거래처 */
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "partner_id", nullable = false)
    private BusinessPartner partner;

    @Column(nullable = false, precision = 18, scale = 2)
    @Builder.Default
    private BigDecimal supplyAmount = BigDecimal.ZERO;

    @Column(nullable = false, precision = 18, scale = 2)
    @Builder.Default
    private BigDecimal vatAmount = BigDecimal.ZERO;

    @Column(nullable = false, precision = 18, scale = 2)
    @Builder.Default
    private BigDecimal totalAmount = BigDecimal.ZERO;

    /** 근거 판매전표 (매출) */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "sales_id")
    private Sales sales;

    /** 근거 구매전표 (매입) */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "purchase_id")
    private Purchase purchase;

    @Column(length = 300)
    private String remark;

    @Column(length = 50)
    private String createdBy;

    /** 근거 전표번호 (표시용) */
    @Transient
    public String getSourceDocNo() {
        if (sales != null) return sales.getDocNo();
        return purchase != null ? purchase.getDocNo() : null;
    }

    /** 다음 진행단계로 전진. 승인 이후엔 더 진행 못 함. */
    public void advance() {
        this.status = this.status.next();
    }
}
