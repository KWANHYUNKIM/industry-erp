package com.erp.accounting.domain;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.LocalDate;
import com.erp.common.BaseTimeEntity;

/**
 * 일자별 환율. (통화, 일자)로 유니크라서 같은 날 두 번 등록되지 않는다.
 * rate 는 통화 unit 만큼에 대한 원화 금액이다 (JPY unit=100, rate=950 → 100엔 = 950원).
 */
@Entity
@Table(name = "exchange_rates",
        uniqueConstraints = @UniqueConstraint(name = "uk_exchange_rates_currency_date",
                columnNames = {"currency_id", "rate_date"}))
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class ExchangeRate extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "currency_id", nullable = false)
    private Currency currency;

    @Column(nullable = false)
    private LocalDate rateDate;

    /** 통화 unit 당 원화 */
    @Column(nullable = false, precision = 18, scale = 4)
    private BigDecimal rate;

    @Column(length = 50)
    private String createdBy;
}
