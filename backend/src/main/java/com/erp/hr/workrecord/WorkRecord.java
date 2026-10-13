package com.erp.hr.workrecord;

import com.erp.common.BaseTimeEntity;
import com.erp.hr.employee.Employee;
import com.erp.hr.payroll.PayItem;
import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * 원본 관리 &gt; 근무기록 &gt; <b>근무입력</b>(E090113) 한 줄.
 *
 * <p>근무입력은 전표 한 장(일자 + 번호, 근무조회의 '2026/10/03 -2')에 줄 여러 개다 —
 * 줄마다 근무일자 · 사원 · 수당항목 · 근무기록(시간 · 일수). 급여계산은 그 달 근무일자의 근무기록을
 * 사원 · 항목별로 더해 변동수당(야근 · 주말 · 연차 …)을 셈한다(PayrollService).
 */
@Entity
@Table(name = "work_records")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class WorkRecord extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** 전표 일자 — 근무입력 머리의 [일자]. */
    @Column(name = "slip_date", nullable = false)
    private LocalDate slipDate;

    /** 같은 일자 안의 전표 번호 (근무조회 [전표일자] '2026/10/03 -2' 의 2). */
    @Column(name = "slip_no", nullable = false)
    private int slipNo;

    @Column(name = "line_no", nullable = false)
    private int lineNo;

    /** 줄의 [근무일자] — 급여계산이 귀속월을 이것으로 가른다. */
    @Column(name = "work_date", nullable = false)
    private LocalDate workDate;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "employee_id", nullable = false)
    private Employee employee;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "pay_item_id", nullable = false)
    private PayItem payItem;

    /** [근무기록] — 지급유형이 변동(시간)이면 시간, 변동(일)이면 일수. */
    @Column(nullable = false, precision = 10, scale = 2)
    private BigDecimal quantity;
}
