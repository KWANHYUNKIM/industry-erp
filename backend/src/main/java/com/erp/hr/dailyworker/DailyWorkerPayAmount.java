package com.erp.hr.dailyworker;

import com.erp.hr.dailypayitem.DailyPayItem;
import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;

/**
 * 일용근로 사원 [급여지급사항] 한 칸 — 기본 항목(일근무 · 소득세 · 지방소득세) 밖의 수당 내역 · 공제 금액.
 * 원본 2026-10-21: 수당등록 · 공제등록에 항목을 더하면 사원 창 '일급수당' · '월정공제' 표에 그 줄이 생긴다.
 */
@Entity
@Table(name = "daily_worker_pay_amounts")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class DailyWorkerPayAmount {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "daily_worker_id")
    private DailyWorker worker;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "item_id")
    private DailyPayItem item;

    @Column(nullable = false, precision = 15, scale = 0)
    private BigDecimal amount;
}
