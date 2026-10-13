package com.erp.hr.dailyworker;

import com.erp.common.BaseTimeEntity;
import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDate;

/**
 * 일용근로 급여대장(원본 E020139 '일용근로 급여계산/대장'). 귀속연월마다 -1, -2 … 차례로 여럿 둘 수 있다.
 * 대상기간(기본 그 달 1일 ~ 말일) · 지급일 · 지급연월 · 대장명칭('2026/10 1차수 (급여)').
 */
@Entity
@Table(name = "daily_pay_ledgers")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class DailyPayLedger extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "pay_month", nullable = false, length = 7)
    private String payMonth;

    @Column(nullable = false)
    private Integer seq;

    @Column(nullable = false, length = 100)
    private String name;

    @Column(name = "paid_month", nullable = false, length = 7)
    private String paidMonth;

    @Column(name = "pay_date", nullable = false)
    private LocalDate payDate;

    @Column(name = "period_from", nullable = false)
    private LocalDate periodFrom;

    @Column(name = "period_to", nullable = false)
    private LocalDate periodTo;

    @Column(nullable = false)
    private boolean confirmed;
}
