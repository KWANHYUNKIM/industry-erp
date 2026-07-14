package com.erp.domain;

import jakarta.persistence.*;
import lombok.*;

/**
 * 외화 통화 마스터. 원화(KRW)는 기준통화라서 등록하지 않는다.
 * 환율은 ExchangeRate 가 일자별로 들고 있고, 여기에는 통화 자체만 둔다.
 */
@Entity
@Table(name = "currencies")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class Currency extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** ISO 4217 통화코드 (USD, JPY, EUR …) */
    @Column(nullable = false, unique = true, length = 3)
    private String code;

    @Column(nullable = false, length = 50)
    private String name;

    /** 통화기호 ($, ¥, € …) */
    @Column(length = 5)
    private String symbol;

    /**
     * 고시 단위. 엔화처럼 100단위로 고시하는 통화가 있어 환산할 때 이 값으로 나눈다.
     * (JPY 100 = 950원이면 unit = 100, rate = 950)
     */
    @Column(nullable = false)
    private Integer unit;

    @Column(nullable = false)
    private boolean active;
}
