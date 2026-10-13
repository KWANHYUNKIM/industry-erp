package com.erp.hr.dailyworker;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;

/** 일용근로 대장의 [근무기록확정] 한 칸 — 사원의 일근무(근로일수). 급여계산은 이 값만 쓴다. */
@Entity
@Table(name = "daily_work_confirms")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class DailyWorkConfirm {

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

    /** 근로일수 — 근무한 날의 수(0.5 일근무도 하루). 원본 E020139(2026-10-14): 일근무 4.5 · 근로일수 5.00. 옛 행은 비어 있다. */
    @Column(name = "work_days", precision = 10, scale = 2)
    private BigDecimal workDays;
}
