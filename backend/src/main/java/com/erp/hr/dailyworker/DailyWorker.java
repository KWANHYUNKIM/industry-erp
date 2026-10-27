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

    /** 원본 [사원정보] 탭 [전화] · [여권번호] · [프로젝트](id 만 — hr 은 inventory 를 참조하지 않는다) · [첨부](stored_files id) */
    @Column(length = 30)
    private String phone;

    @Column(name = "passport_no", length = 30)
    private String passportNo;

    @Column(name = "project_id")
    private Long projectId;

    @Column(name = "attachment_file_id")
    private Long attachmentFileId;

    /** 원본 [추가정보] 탭 고정 열다섯 칸: 문자 · 숫자 · Y/N · 일자 · 코드 형식 1~3 */
    @Column(length = 100) private String text1;
    @Column(length = 100) private String text2;
    @Column(length = 100) private String text3;
    @Column(precision = 18, scale = 2) private BigDecimal num1;
    @Column(precision = 18, scale = 2) private BigDecimal num2;
    @Column(precision = 18, scale = 2) private BigDecimal num3;
    @Column(length = 1) private String yn1;
    @Column(length = 1) private String yn2;
    @Column(length = 1) private String yn3;
    private LocalDate date1;
    private LocalDate date2;
    private LocalDate date3;
    @Column(length = 50) private String code1;
    @Column(length = 50) private String code2;
    @Column(length = 50) private String code3;
}
