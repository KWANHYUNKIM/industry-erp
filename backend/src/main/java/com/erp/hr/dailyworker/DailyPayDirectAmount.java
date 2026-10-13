package com.erp.hr.dailyworker;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;

/**
 * 일용근로 급여계산/대장 [사전작업] 금액직접입력 한 칸(원본 E020139 '수당/공제 항목입력').
 * 대장 · 사원마다 일근무 금액(비우면 셈 그대로) · 메모 · 명세서 상단/하단메세지.
 */
@Entity
@Table(name = "daily_pay_direct_amounts")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class DailyPayDirectAmount {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "ledger_id")
    private DailyPayLedger ledger;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "daily_worker_id")
    private DailyWorker worker;

    @Column(name = "day_amount", precision = 15, scale = 0)
    private BigDecimal dayAmount;

    @Column(length = 200)
    private String memo;

    @Column(name = "top_message", length = 200)
    private String topMessage;

    @Column(name = "bottom_message", length = 200)
    private String bottomMessage;
}
