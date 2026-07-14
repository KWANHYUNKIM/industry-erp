package com.erp.domain;

import com.erp.domain.enums.ReceiptMethod;
import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * 수입 등록. 비용등록(Expense)의 대칭이다 — 매출 전표를 거치지 않는 수익
 * (이자수익·잡이익·임대수입 등)을 잡는다.
 *
 * 등록하면 바로 분개가 생긴다. 차변은 회수 수단이 정하고(현금/예금/외상매출금),
 * 대변은 고른 수익 계정이다. 계좌입금이면 계좌 잔액도 함께 오른다.
 */
@Entity
@Table(name = "incomes")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class Income extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "income_date", nullable = false)
    private LocalDate incomeDate;

    /** 수익 계정 (계정구분이 REVENUE 여야 한다) */
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "account_id", nullable = false)
    private Account account;

    @Column(nullable = false, length = 200)
    private String content;

    /** 거래처명. 마스터에 없는 상대도 있어 문자열로 둔다. */
    @Column(name = "partner_name", length = 100)
    private String partnerName;

    @Column(nullable = false, precision = 18, scale = 2)
    private BigDecimal amount;

    @Enumerated(EnumType.STRING)
    @Column(name = "receipt_method", nullable = false, length = 20)
    private ReceiptMethod receiptMethod;

    /** 계좌입금일 때 입금된 계좌 */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "bank_account_id")
    private BankAccount bankAccount;

    /** 등록 시 생성된 회계전표 */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "journal_entry_id")
    private JournalEntry journalEntry;

    @Column(length = 100)
    private String department;

    @Column(name = "created_by", length = 50)
    private String createdBy;
}
