package com.erp.accounting.fastvoucher;

import com.erp.accounting.account.Account;
import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;

/** 간편전표 한 줄. 지출/입금/사용 내역 하나가 계정 하나에 대응한다. */
@Entity
@Table(name = "fast_voucher_lines")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class FastVoucherLine {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "voucher_id", nullable = false)
    private FastVoucher voucher;

    /** 지출결의서면 비용계정, 입금보고서면 수입/채권계정, 가지급금정산서면 실제 사용한 비용계정 */
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "account_id", nullable = false)
    private Account account;

    @Column(nullable = false, precision = 18, scale = 2)
    private BigDecimal amount;

    @Column(length = 200)
    private String description;

    @Column(nullable = false)
    private Integer lineNo;

    /**
     * 원본 격자의 [돈 나간 계좌] · [돈 들어온 계좌] — 줄마다 정한다(2026-10-12 loginaa 실측).
     * {@link #ownSettlement} 가 참이면 이 값이 그 줄의 결제 계좌이고, 비어 있으면 000 현금이다.
     */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "bank_account_id")
    private com.erp.accounting.bankcard.BankAccount bankAccount;

    /** 원본 격자의 [거래처] — 줄마다 다를 수 있다. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "partner_id")
    private com.erp.trade.partner.BusinessPartner partner;

    /**
     * 가지급금정산서 격자의 [정산자] — 사원(2026-10-12 loginaa E010505 실측: 사원검색 창).
     * hr 모듈을 참조하지 않으려고 id 와 고를 때의 이름만 든다. 대변 가지급금은 정산자별로 묶인다.
     */
    @Column(name = "employee_id")
    private Long employeeId;

    @Column(name = "employee_name", length = 100)
    private String employeeName;

    /**
     * 격자 [추가정보] › 부가세정보(2026-10-21 loginaa 지출결의서 실측) — 부가세유형(세금계산서 …) · 발생일자 · 거래처 · 공급가액 · 부가세.
     * 있으면 분개가 차) 줄 계정 공급가액 · 부가세대급금 부가세 로 갈라지고 매입장에 선다. 없으면 vatType null.
     */
    @Column(name = "vat_type", length = 30)
    private String vatType;

    @Column(name = "vat_date")
    private java.time.LocalDate vatDate;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "vat_partner_id")
    private com.erp.trade.partner.BusinessPartner vatPartner;

    @Column(name = "vat_supply", precision = 18, scale = 2)
    private BigDecimal vatSupply;

    @Column(name = "vat_amount", precision = 18, scale = 2)
    private BigDecimal vatAmount;

    /** 줄이 제 결제 계좌를 정했는지. false 는 옛 줄 — 머리 결제수단을 따른다. */
    @Column(nullable = false)
    @Builder.Default
    private boolean ownSettlement = false;
}
