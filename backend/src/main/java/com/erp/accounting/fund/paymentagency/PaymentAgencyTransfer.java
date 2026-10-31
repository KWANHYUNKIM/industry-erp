package com.erp.accounting.fund.paymentagency;

import jakarta.persistence.*;
import lombok.*;

/**
 * 결제대행사 [이체정보] 한 줄(2026-10-21 loginaa 결제대행사등록 E010114 실측) — 이체정보리스트의
 * 은행코드 · 은행 · 계좌번호 · 예금주명 · 적요1 · 적요2 · 기본. 결제대행사 하나에 여러 줄.
 */
@Entity
@Table(name = "payment_agency_transfers")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class PaymentAgencyTransfer {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "payment_agency_id", nullable = false)
    private PaymentAgency paymentAgency;

    @Column(name = "bank_code", length = 10)
    private String bankCode;

    @Column(name = "bank_name", length = 50)
    private String bankName;

    @Column(name = "account_no", nullable = false, length = 50)
    private String accountNo;

    @Column(length = 50)
    private String holder;

    @Column(length = 100)
    private String memo1;

    @Column(length = 100)
    private String memo2;

    /** 기본이체통장 — 목록 [기본] 칸에 주황 ✓. */
    @Column(name = "is_default", nullable = false)
    private boolean defaultTransfer;
}
