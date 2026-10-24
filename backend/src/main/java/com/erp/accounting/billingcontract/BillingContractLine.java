package com.erp.accounting.billingcontract;

import com.erp.accounting.contractitem.ContractItem;
import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;

/**
 * 계약입력 줄 — 항목코드 · 항목명 · 청구예정월([등록] 창: 전체 · 1월 ~ 12월 체크) · 수량 · 단가 · 공급가액 · 부가세(공급가액의 10%) · 청구단위(필수) · 적요.
 * 청구예정월은 '01,02,…,12' 처럼 두 자리 달을 쉼표로 잇는다.
 */
@Entity
@Table(name = "billing_contract_lines")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class BillingContractLine {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "contract_id", nullable = false)
    private BillingContract contract;

    @Column(name = "line_no", nullable = false)
    private Integer lineNo;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "item_id", nullable = false)
    private ContractItem item;

    @Column(name = "bill_months", nullable = false, length = 40)
    private String billMonths;

    @Column(nullable = false, precision = 18, scale = 2)
    private BigDecimal quantity;

    @Column(name = "unit_price", nullable = false, precision = 18, scale = 2)
    private BigDecimal unitPrice;

    @Column(name = "supply_amount", nullable = false, precision = 18, scale = 2)
    private BigDecimal supplyAmount;

    @Column(name = "vat_amount", nullable = false, precision = 18, scale = 2)
    private BigDecimal vatAmount;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "billing_unit_id")
    private BillingUnit billingUnit;

    @Column(length = 200)
    private String remark;

    /** 품목연결설정(차례대로). */
    @OneToMany(mappedBy = "contractLine", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("lineNo ASC")
    @Builder.Default
    private java.util.List<BillingContractLineProduct> products = new java.util.ArrayList<>();

    /** 이 줄이 그 달(1~12)에 청구되나. */
    public boolean billsIn(int month) {
        String m = String.format("%02d", month);
        for (String s : billMonths.split(",")) if (s.trim().equals(m)) return true;
        return false;
    }
}
