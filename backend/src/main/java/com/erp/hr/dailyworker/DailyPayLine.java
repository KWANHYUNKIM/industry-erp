package com.erp.hr.dailyworker;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;

/** 일용근로 급여대장 한 줄(전체계산이 만든다) — 일근무 · 지급총액 · 소득세 · 지방소득세 · 실지급액. */
@Entity
@Table(name = "daily_pay_lines")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class DailyPayLine {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "ledger_id")
    private DailyPayLedger ledger;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "daily_worker_id")
    private DailyWorker worker;

    @Column(nullable = false, precision = 10, scale = 2)
    private BigDecimal days;

    @Column(name = "gross_pay", nullable = false, precision = 15, scale = 0)
    private BigDecimal grossPay;

    @Column(name = "income_tax", nullable = false, precision = 15, scale = 0)
    private BigDecimal incomeTax;

    @Column(name = "local_tax", nullable = false, precision = 15, scale = 0)
    private BigDecimal localTax;

    @Column(name = "net_pay", nullable = false, precision = 15, scale = 0)
    private BigDecimal netPay;
}
