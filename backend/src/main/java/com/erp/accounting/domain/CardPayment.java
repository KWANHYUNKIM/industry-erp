package com.erp.accounting.domain;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import com.erp.common.BaseTimeEntity;

/**
 * 법인카드 대금결제. 카드사용 시점에 남긴 미지급금을 결제일에 결제계좌에서 갚는다.
 *
 * 카드사용   차)비용·부가세대급금 / 대)미지급금   (CardUsage)
 * 대금결제   차)미지급금          / 대)예금계정   (여기)
 *
 * 결제한 카드사용은 다시 결제되지 않는다(card_payment_lines.card_usage_id 유니크).
 */
@Entity
@Table(name = "card_payments")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class CardPayment extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** 결제번호 (예: CP-20260714-0001) */
    @Column(nullable = false, unique = true, length = 30)
    private String paymentNo;

    @Column(nullable = false)
    private LocalDate paymentDate;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "card_id", nullable = false)
    private CreditCard card;

    /** 카드대금이 빠져나가는 계좌 */
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "bank_account_id", nullable = false)
    private BankAccount bankAccount;

    /** 결제 총액 = 포함된 카드사용의 합계 */
    @Column(nullable = false, precision = 18, scale = 2)
    private BigDecimal amount;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "journal_entry_id")
    private JournalEntry journalEntry;

    @Column(length = 50)
    private String createdBy;

    @OneToMany(mappedBy = "payment", cascade = CascadeType.ALL, orphanRemoval = true)
    @Builder.Default
    private List<CardPaymentLine> lines = new ArrayList<>();

    public void addLine(CardPaymentLine line) {
        line.setPayment(this);
        lines.add(line);
    }
}
