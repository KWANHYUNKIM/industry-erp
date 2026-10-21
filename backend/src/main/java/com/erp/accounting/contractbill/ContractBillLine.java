package com.erp.accounting.contractbill;

import com.erp.accounting.billingcontract.BillingContractLine;
import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.LocalDate;

/** 청구자료 줄 — 계약 줄 하나의 한 달 몫. 수량 · 단가 · 공급가액 · 부가세 · 적요는 생성 창에서 고칠 수 있다. */
@Entity
@Table(name = "contract_bill_lines")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class ContractBillLine {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "bill_id", nullable = false)
    private ContractBill bill;

    @Column(name = "line_no", nullable = false)
    private Integer lineNo;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "contract_line_id", nullable = false)
    private BillingContractLine contractLine;

    /** 'YYYY-MM' */
    @Column(name = "bill_month", nullable = false, length = 7)
    private String billMonth;

    @Column(nullable = false, precision = 18, scale = 2)
    private BigDecimal quantity;

    @Column(name = "unit_price", nullable = false, precision = 18, scale = 2)
    private BigDecimal unitPrice;

    @Column(name = "supply_amount", nullable = false, precision = 18, scale = 2)
    private BigDecimal supplyAmount;

    @Column(name = "vat_amount", nullable = false, precision = 18, scale = 2)
    private BigDecimal vatAmount;

    @Column(length = 200)
    private String remark;

    /** 회계/판매일괄반영(E060906)으로 만든 매출전표 I. 회계거래조회에서 그 전표를 지우면 DB 가 비운다(V354 ON DELETE SET NULL). */
    @Column(name = "journal_entry_id")
    private Long journalEntryId;

    /** 회계/판매일괄반영 [판매반영 › 판매전표 발행]으로 만든 판매. 판매조회에서 그 전표를 지우면 DB 가 비운다(V372 ON DELETE SET NULL). */
    @Column(name = "sales_id")
    private Long salesId;

    /**
     * 반영한 매출전표 I 의 일자 · 번호('2026/10/21-16'). 전표를 회계 쪽에서 지워도 남는다(V432, 2026-10-21 실측) —
     * 원본은 그래도 회계반영여부 ✓ · 일괄반영 격자에서 빠짐 · 삭제 막힘이고, [회계전표삭제] 를 해야 풀린다.
     */
    @Column(name = "reflected_entry_date")
    private LocalDate reflectedEntryDate;

    @Column(name = "reflected_entry_no")
    private Integer reflectedEntryNo;

    /** 회계/판매일괄반영으로 회계반영됐다(전표가 지워졌어도 [회계전표삭제] 전까지는 그렇다). */
    public boolean isAccountingLinked() {
        return journalEntryId != null || reflectedEntryDate != null;
    }

    /** 회계반영이든 판매반영이든 한 번 반영되면 두 격자 모두에서 빠진다(원본 실측). */
    public boolean isReflected() {
        return isAccountingLinked() || salesId != null;
    }

    /** [회계전표삭제] — 반영 연결을 푼다. */
    public void clearAccountingLink() {
        journalEntryId = null;
        reflectedEntryDate = null;
        reflectedEntryNo = null;
    }
}
