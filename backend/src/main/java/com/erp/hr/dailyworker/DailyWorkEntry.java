package com.erp.hr.dailyworker;

import com.erp.common.BaseTimeEntity;
import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * 일용근로 근무입력 한 줄(원본 E020138). 전표(일자-No.)마다 여러 줄. 수당항목은 일급수당 '일근무' 하나라 칸을 두지 않는다
 * (일용근로 수당등록이 생기면 항목을 단다). 금액은 원본처럼 비워 두면 급여계산이 일근무 × 근무기록으로 셈한다.
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

    @Column(nullable = false, precision = 10, scale = 2)
    private BigDecimal quantity;

    @Column(precision = 15, scale = 0)
    private BigDecimal amount;
}
