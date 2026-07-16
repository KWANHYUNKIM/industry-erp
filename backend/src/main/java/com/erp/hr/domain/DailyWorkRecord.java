package com.erp.hr.domain;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.LocalDate;
import com.erp.common.BaseTimeEntity;

/**
 * 일용근로 출역 기록. 일용직은 근무한 날마다 일당을 받으므로 급여명세(Payslip)가 아니라
 * 근무일 단위로 쌓고, 세액은 등록 시점에 계산해 박아 둔다(세율이 바뀌어도 과거 기록은 불변).
 */
@Entity
@Table(name = "daily_work_records")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class DailyWorkRecord extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "employee_id")
    private Employee employee;

    @Column(name = "work_date", nullable = false)
    private LocalDate workDate;

    @Column(name = "work_hours", nullable = false)
    @Builder.Default
    private int workHours = 8;

    @Column(name = "daily_wage", nullable = false, precision = 18, scale = 2)
    private BigDecimal dailyWage;

    @Column(name = "income_tax", nullable = false, precision = 18, scale = 2)
    @Builder.Default
    private BigDecimal incomeTax = BigDecimal.ZERO;

    @Column(name = "local_income_tax", nullable = false, precision = 18, scale = 2)
    @Builder.Default
    private BigDecimal localIncomeTax = BigDecimal.ZERO;

    /** 실지급액 = 일당 − 소득세 − 지방소득세 */
    @Column(name = "net_pay", nullable = false, precision = 18, scale = 2)
    @Builder.Default
    private BigDecimal netPay = BigDecimal.ZERO;

    @Column(nullable = false)
    @Builder.Default
    private boolean paid = false;

    @Column(name = "paid_date")
    private LocalDate paidDate;

    @Column(length = 500)
    private String remark;

    @Column(name = "created_by", length = 50)
    private String createdBy;
}
