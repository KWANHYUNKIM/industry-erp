package com.erp.hr.dailyworker;

import com.erp.common.BaseTimeEntity;
import com.erp.hr.dailypayitem.DailyPayItem;
import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * 일용근로 근무입력 한 줄(원본 E020138). 전표(일자-No.)마다 여러 줄. 수당항목은 일용근로 수당등록의 항목(비면 기본 '일근무' —
 * 이 칸이 생기기 전 줄). 금액은 원본처럼 비워 두면 급여계산이 수당 내역 × 근무기록으로 셈한다.
 */
@Entity
@Table(name = "daily_work_entries")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class DailyWorkEntry extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "slip_date", nullable = false)
    private LocalDate slipDate;

    @Column(name = "slip_no", nullable = false)
    private Integer slipNo;

    @Column(name = "line_no", nullable = false)
    private Integer lineNo;

    @Column(name = "work_date", nullable = false)
    private LocalDate workDate;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "daily_worker_id")
    private DailyWorker worker;

    /** 수당항목 — null 이면 기본 '일근무'(2026-10-21 이전 줄). */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "pay_item_id")
    private DailyPayItem payItem;

    @Column(nullable = false, precision = 10, scale = 2)
    private BigDecimal quantity;

    /** 기본 '일근무' 줄인가(수당항목이 비었거나 기본 항목). */
    public boolean isDayWork() {
        return payItem == null || payItem.isBuiltin();
    }

    @Column(precision = 15, scale = 0)
    private BigDecimal amount;
}
