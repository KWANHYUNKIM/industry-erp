package com.erp.domain;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;

/** 결제에 포함된 카드사용 한 건. card_usage_id 가 유니크라서 같은 사용건을 두 번 결제할 수 없다. */
@Entity
@Table(name = "card_payment_lines",
        uniqueConstraints = @UniqueConstraint(name = "uk_card_payment_lines_usage",
                columnNames = {"card_usage_id"}))
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class CardPaymentLine {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "payment_id", nullable = false)
    private CardPayment payment;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "card_usage_id", nullable = false)
    private CardUsage cardUsage;

    @Column(nullable = false, precision = 18, scale = 2)
    private BigDecimal amount;
}
