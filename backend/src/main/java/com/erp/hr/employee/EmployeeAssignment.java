package com.erp.hr.employee;

import com.erp.hr.department.Department;
import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDate;
import com.erp.common.BaseTimeEntity;

/**
 * 인사발령 이력. 사원의 현재 부서·직위·재직상태는 Employee 가 들고,
 * 그것이 언제 어떻게 바뀌었는지는 이 이력이 들고 있다.
 */
@Entity
@Table(name = "employee_assignments")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class EmployeeAssignment extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "employee_id")
    private Employee employee;

    /** 인사발령입력 전표(원본 일자-No.). 한 전표에 여러 사원의 발령 줄이 든다. */
    @Column(name = "slip_date", nullable = false)
    private LocalDate slipDate;

    @Column(name = "slip_no", nullable = false)
    private Integer slipNo;

    @Column(name = "assign_date", nullable = false)
    private LocalDate assignDate;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private AssignmentType type;

    /** 발령 후 소속 부서. 퇴사 발령이면 직전 부서를 그대로 적는다. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "department_id")
    private Department department;

    /** 발령 전 부서·직위(원본 '이전 부서' · '이전 직위/직급'). 발령할 때 사원의 그때 값을 적는다. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "prev_department_id")
    private Department prevDepartment;

    @Column(name = "prev_job_title", length = 100)
    private String prevJobTitle;

    /** 원본 '입사구분'(신입 · 경력 …) — 회사가 적는 글자 */
    @Column(name = "hire_kind", length = 50)
    private String hireKind;

    /** 발령 후 직위 */
    @Column(name = "job_title", length = 100)
    private String jobTitle;

    @Column(length = 500)
    private String remark;

    @Column(name = "created_by", length = 50)
    private String createdBy;
}
