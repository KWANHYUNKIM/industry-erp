package com.erp.accounting.domain;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.LocalDate;
import com.erp.common.BaseTimeEntity;

/**
 * 계좌간이동. 회사 계좌 A 에서 계좌 B 로 돈을 옮긴다.
 * 회사 밖으로 나가는 돈이 아니므로 손익에 영향이 없다 —
 * 분개는 차)입금계좌 예금계정 / 대)출금계좌 예금계정 뿐이다.
 */
@Entity
@Table(name = "account_transfers")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class AccountTransfer extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** 이동번호 (예: AT-20260714-0001) */
    @Column(nullable = false, unique = true, length = 30)
    private String transferNo;

    @Column(nullable = false)
    private LocalDate transferDate;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "from_account_id", nullable = false)
    private BankAccount fromAccount;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "to_account_id", nullable = false)
    private BankAccount toAccount;

    @Column(nullable = false, precision = 18, scale = 2)
    private BigDecimal amount;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "journal_entry_id")
    private JournalEntry journalEntry;

    @Column(length = 200)
    private String description;

    @Column(length = 50)
    private String createdBy;
}
