package com.erp.domain;

import com.erp.domain.enums.ContractStatus;
import com.erp.domain.enums.ContractType;
import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 전자근로계약. 계약 시점의 근로조건(부서·직위·급여·근로시간)을 그대로 박아 둔다.
 * 사원 마스터가 나중에 바뀌어도 이미 서명된 계약서의 조건은 바뀌면 안 되기 때문이다.
 */
@Entity
@Table(name = "employment_contracts")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class EmploymentContract extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** 계약번호 (EC-yyyyMMdd-NNNN) */
    @Column(name = "contract_no", nullable = false, unique = true, length = 30)
    private String contractNo;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "employee_id")
    private Employee employee;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private ContractType type;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    @Builder.Default
    private ContractStatus status = ContractStatus.DRAFT;

    @Column(name = "start_date", nullable = false)
    private LocalDate startDate;

    /** 계약 종료일. 정규직은 null */
    @Column(name = "end_date")
    private LocalDate endDate;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "department_id")
    private Department department;

    @Column(name = "job_title", length = 100)
    private String jobTitle;

    @Column(name = "monthly_salary", nullable = false, precision = 18, scale = 2)
    @Builder.Default
    private BigDecimal monthlySalary = BigDecimal.ZERO;

    @Column(name = "weekly_hours", nullable = false)
    @Builder.Default
    private int weeklyHours = 40;

    @Column(name = "work_place", length = 200)
    private String workPlace;

    @Column(length = 200)
    private String duty;

    @Column(name = "signed_at")
    private LocalDateTime signedAt;

    /** 서명자명 (사원 본인 확인) */
    @Column(name = "signed_by", length = 100)
    private String signedBy;

    @Column(length = 500)
    private String remark;

    @Column(name = "created_by", length = 50)
    private String createdBy;
}
