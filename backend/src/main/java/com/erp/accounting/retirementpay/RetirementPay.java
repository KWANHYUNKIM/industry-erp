package com.erp.accounting.retirementpay;

import com.erp.common.BaseTimeEntity;
import com.erp.hr.employee.Employee;
import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * 퇴직금계산(E030117) 한 건. 계산에 쓴 값(3개월 임금 · 1년 상여 · 일수)과 결과(퇴직급여 · 세금)를 같이 든다 —
 * 원본처럼 퇴직급여를 손으로 고치면 세금만 다시 센다.
 */
@Entity
@Table(name = "retirement_pays")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class RetirementPay extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "employee_id")
    private Employee employee;

    /** 원천징수연월 YYYY-MM */
    @Column(name = "withholding_month", nullable = false, length = 7)
    private String withholdingMonth;

    @Column(name = "pay_date", nullable = false)
    private LocalDate payDate;

    /** 기산일 */
    @Column(name = "start_date", nullable = false)
    private LocalDate startDate;

    @Column(name = "retire_date", nullable = false)
    private LocalDate retireDate;

    @Column(name = "retire_reason", length = 50)
    private String retireReason;

    @Column(nullable = false)
    private boolean executive;

    /** ⓐ 3개월 동안의 급여 */
    @Column(name = "wage_3m", nullable = false, precision = 18, scale = 2)
    private BigDecimal wage3m;

    /** ⓑ 1년 상여합계 */
    @Column(name = "bonus_1y", nullable = false, precision = 18, scale = 2)
    private BigDecimal bonus1y;

    /** ⓓ 추가급여(3개월로 환산한 금액) */
    @Column(name = "extra_pay", nullable = false, precision = 18, scale = 2)
    private BigDecimal extraPay;

    @Column(name = "work_days_3m", nullable = false)
    private int workDays3m;

    @Column(name = "service_days", nullable = false)
    private int serviceDays;

    @Column(name = "service_months", nullable = false)
    private int serviceMonths;

    @Column(name = "service_years", nullable = false)
    private int serviceYears;

    /** (15) 퇴직급여 */
    @Column(name = "retirement_pay", nullable = false, precision = 18, scale = 2)
    private BigDecimal retirementPay;

    /** (16) 비과세 퇴직급여 */
    @Column(name = "non_taxable", nullable = false, precision = 18, scale = 2)
    private BigDecimal nonTaxable;

    @Column(name = "income_tax", nullable = false, precision = 18, scale = 2)
    private BigDecimal incomeTax;

    @Column(name = "local_income_tax", nullable = false, precision = 18, scale = 2)
    private BigDecimal localIncomeTax;
}
