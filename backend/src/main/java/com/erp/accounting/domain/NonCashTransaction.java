package com.erp.accounting.domain;

import com.erp.accounting.domain.enums.NonCashType;
import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.LocalDate;
import com.erp.common.BaseTimeEntity;
import com.erp.trade.domain.BusinessPartner;

/**
 * 비현금거래(대체전표). 현금·예금이 움직이지 않는 거래를 차변계정 하나 · 대변계정 하나로 남긴다.
 * 현금성 계정이 끼면 저장을 거절한다 — 그건 현금거래/계좌입출금 화면이 할 일이다.
 */
@Entity
@Table(name = "non_cash_transactions")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class NonCashTransaction extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** 전표번호 (예: NC-20260714-0001) */
    @Column(nullable = false, unique = true, length = 30)
    private String txnNo;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private NonCashType type;

    @Column(nullable = false)
    private LocalDate txnDate;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "debit_account_id", nullable = false)
    private Account debitAccount;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "credit_account_id", nullable = false)
    private Account creditAccount;

    @Column(nullable = false, precision = 18, scale = 2)
    private BigDecimal amount;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "partner_id")
    private BusinessPartner partner;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "journal_entry_id")
    private JournalEntry journalEntry;

    @Column(length = 200)
    private String description;

    @Column(length = 50)
    private String createdBy;
}
