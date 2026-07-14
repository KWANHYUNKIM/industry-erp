package com.erp.domain;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * 카드사용 내역. 사용 즉시 현금이 나가지 않으므로
 * 차)비용계정·부가세대급금 / 대)미지급금 으로 분개한다.
 */
@Entity
@Table(name = "card_usages")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class CardUsage extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** 전표번호 (예: CU-20260714-0001) */
    @Column(nullable = false, unique = true, length = 30)
    private String usageNo;

    @Column(nullable = false)
    private LocalDate usageDate;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "card_id", nullable = false)
    private CreditCard card;

    /** 가맹점 */
    @Column(nullable = false, length = 100)
    private String merchant;

    /** 비용계정 (차변) */
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "expense_account_id", nullable = false)
    private Account expenseAccount;

    @Column(nullable = false, precision = 18, scale = 2)
    private BigDecimal supplyAmount;

    @Column(nullable = false, precision = 18, scale = 2)
    private BigDecimal vatAmount;

    @Column(nullable = false, precision = 18, scale = 2)
    private BigDecimal totalAmount;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "journal_entry_id")
    private JournalEntry journalEntry;

    @Column(length = 200)
    private String description;

    @Column(length = 50)
    private String createdBy;
}
