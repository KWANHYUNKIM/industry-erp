package com.erp.accounting.contractbill;

import com.erp.accounting.billingcontract.BillingContractLine;
import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;

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
}
