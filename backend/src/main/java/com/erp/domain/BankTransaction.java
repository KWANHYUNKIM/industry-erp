package com.erp.domain;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * 계좌 입출금. 입금이면 예금계정 차변, 출금이면 대변으로 분개된다.
 * balanceAfter 는 처리 후 계좌 잔액이라 통장 사본처럼 그대로 읽을 수 있다.
 */
@Entity
@Table(name = "bank_transactions")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class BankTransaction extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** 전표번호 (예: BK-20260714-0001) */
    @Column(nullable = false, unique = true, length = 30)
    private String txnNo;

    @Column(nullable = false)
    private LocalDate txnDate;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "bank_account_id", nullable = false)
    private BankAccount bankAccount;

    /** true = 입금, false = 출금 */
    @Column(nullable = false)
    private boolean deposit;

    @Column(nullable = false, precision = 18, scale = 2)
    private BigDecimal amount;

    /** 상대계정 (입금이면 대변, 출금이면 차변에 선다) */
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "counter_account_id", nullable = false)
    private Account counterAccount;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "partner_id")
    private BusinessPartner partner;

    /** 처리 후 계좌 잔액 */
    @Column(nullable = false, precision = 18, scale = 2)
    private BigDecimal balanceAfter;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "journal_entry_id")
    private JournalEntry journalEntry;

    @Column(length = 200)
    private String description;

    @Column(length = 50)
    private String createdBy;
}
