package com.erp.accounting.tax.yearend;

import com.erp.common.BaseTimeEntity;
import jakarta.persistence.*;
import lombok.*;

/** 공제 한 줄 — 보험료 세액공제 · 의료비 창의 한 줄(plans/세무/연말정산.md 3.2 · 3.3). */
@Entity
@Table(name = "tax_settlement_deductions")
@Getter
@Setter
@NoArgsConstructor
public class TaxSettlementDeduction extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "settlement_id")
    private TaxSettlement settlement;

    @Column(name = "line_no", nullable = false)
    private int lineNo;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 30)
    private TaxDeductionKind kind;

    /** 대상자 이름 · 관계(본인 …) — 가족은 아직 없다(주민번호 결정 대기). */
    @Column(name = "target_name", length = 50) private String targetName;
    @Column(length = 20) private String relation;

    @Enumerated(EnumType.STRING)
    @Column(name = "data_source", nullable = false, length = 10)
    private TaxDataSource dataSource = TaxDataSource.NTS;

    /** 의료비: 본인 · 65세 이상 · 장애인 · 6세 이하(한도 없음)면 true */
    @Column(nullable = false)
    private boolean unlimited = true;

    @Column(nullable = false) private long amount;
    @Column(name = "receipt_count") private Integer receiptCount;
}
