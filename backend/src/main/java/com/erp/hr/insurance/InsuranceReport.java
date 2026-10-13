package com.erp.hr.insurance;

import com.erp.common.BaseTimeEntity;
import com.erp.hr.employee.Employee;
import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDate;

/**
 * 4대보험 신고 한 건(취득 · 상실 · 피부양자). 번호는 일자-No.(2026/10/14 -1).
 * 보험별 신청구분 · 취득(상실)일은 칸으로, 나머지 부호 · 금액 칸은 {@code detail}(JSON) 에 화면 그대로 둔다.
 * 선택삭제는 지우지 않고 {@code deleted} 로 표시한다(원본 조건 [삭제구분] 전체 · 미삭제 · 삭제).
 */
@Entity
@Table(name = "insurance_reports")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class InsuranceReport extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "report_date", nullable = false)
    private LocalDate reportDate;

    @Column(name = "report_seq", nullable = false)
    private Integer reportSeq;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private InsuranceReportKind kind;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "employee_id")
    private Employee employee;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "pension_workplace_id")
    private InsuranceWorkplace pensionWorkplace;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "health_workplace_id")
    private InsuranceWorkplace healthWorkplace;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "employment_workplace_id")
    private InsuranceWorkplace employmentWorkplace;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "accident_workplace_id")
    private InsuranceWorkplace accidentWorkplace;

    @Column(name = "pension_apply", nullable = false)
    private boolean pensionApply;

    @Column(name = "pension_date")
    private LocalDate pensionDate;

    @Column(name = "health_apply", nullable = false)
    private boolean healthApply;

    @Column(name = "health_date")
    private LocalDate healthDate;

    @Column(name = "employment_apply", nullable = false)
    private boolean employmentApply;

    @Column(name = "employment_date")
    private LocalDate employmentDate;

    @Column(name = "accident_apply", nullable = false)
    private boolean accidentApply;

    @Column(name = "accident_date")
    private LocalDate accidentDate;

    @Column(length = 30)
    private String phone;

    @Column(columnDefinition = "text")
    private String detail;

    @Column(columnDefinition = "text")
    private String dependents;

    @Column(nullable = false)
    private boolean deleted;
}
