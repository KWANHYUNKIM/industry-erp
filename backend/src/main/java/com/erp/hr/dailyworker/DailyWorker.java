package com.erp.hr.dailyworker;

import com.erp.common.BaseTimeEntity;
import com.erp.hr.department.Department;
import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * 일용근로 사원(원본 E020105 '일용근로 사원리스트'). 원본은 상용 사원과 다른 목록 · 다른 번호(00001 …)를 쓴다.
 * [기본] 탭의 칸과 [급여지급사항] 탭의 일급(일근무) · 월정공제(소득세 · 지방소득세)를 든다.
 */
@Entity
@Table(name = "daily_workers")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class DailyWorker extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true, length = 20)
    private String code;

    @Column(nullable = false, length = 50)
    private String name;

    @Column(nullable = false)
    private boolean foreigner;

    @Column(length = 50)
    private String nationality;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "department_id")
    private Department department;

    @Column(length = 30)
    private String mobile;

    @Column(length = 100)
    private String email;

    @Column(name = "hire_date")
    private LocalDate hireDate;

    @Column(name = "resign_date")
    private LocalDate resignDate;

    @Column(length = 10)
    private String zipcode;

    @Column(length = 300)
    private String address;

    /** 고용보험 대상(원본 기본값 '대상') */
    @Column(name = "employment_insurance", nullable = false)
    private boolean employmentInsurance;

    /** 국민연금 — true 면 자동계산, false 면 기준소득월액 기준 */
    @Column(name = "pension_auto", nullable = false)
    private boolean pensionAuto;

    @Column(name = "pension_base", precision = 15, scale = 0)
    private BigDecimal pensionBase;

    /** 건강보험 — true 면 자동계산, false 면 보수월액 기준 */
    @Column(name = "health_auto", nullable = false)
    private boolean healthAuto;

    @Column(name = "health_base", precision = 15, scale = 0)
    private BigDecimal healthBase;

    @Column(name = "bank_name", length = 50)
    private String bankName;

    @Column(name = "account_no", length = 50)
    private String accountNo;

    @Column(name = "account_holder", length = 50)
    private String accountHolder;

    @Column(length = 500)
    private String remark;

    /** [급여지급사항] 일급수당 '일근무' 내역 */
    @Column(name = "daily_wage", precision = 15, scale = 0)
    private BigDecimal dailyWage;

    /** [급여지급사항] 월정공제 소득세 · 지방소득세 */
    @Column(name = "fixed_income_tax", precision = 15, scale = 0)
    private BigDecimal fixedIncomeTax;

    @Column(name = "fixed_local_tax", precision = 15, scale = 0)
    private BigDecimal fixedLocalTax;
}
