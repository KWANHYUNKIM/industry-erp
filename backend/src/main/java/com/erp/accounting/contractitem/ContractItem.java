package com.erp.accounting.contractitem;

import com.erp.accounting.account.Account;
import com.erp.common.BaseTimeEntity;
import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;

/**
 * 회계 II › 계약관리 › <b>계약항목등록</b>(E060901) 한 줄 — 2026-10-13 loginaa 실측.
 *
 * <p>창: 계약항목코드(필수, 5자) · 계약항목명(필수) · 단가 + VAT포함 · 품목별단가 · 수량별단가 · 청구주기(1회 · 주기적, 기본 1회) · 매출계정.
 * 품목별 · 수량별단가 [설정] 창은 아직 재지 않아 두지 않는다.
 */
@Entity
@Table(name = "contract_items")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class ContractItem extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 20)
    private String code;

    @Column(nullable = false, length = 100)
    private String name;

    @Column(name = "unit_price", nullable = false, precision = 18, scale = 2)
    private BigDecimal unitPrice;

    @Column(name = "vat_included", nullable = false)
    private boolean vatIncluded;

    @Enumerated(EnumType.STRING)
    @Column(name = "billing_cycle", nullable = false, length = 10)
    private BillingCycle billingCycle;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "sales_account_id")
    private Account salesAccount;

    @Column(nullable = false)
    private boolean active;
}
