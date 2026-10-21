package com.erp.hr.contract;

import com.erp.hr.department.Department;
import com.erp.hr.employee.Employee;
import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import com.erp.common.BaseTimeEntity;

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

    /** 계약참여자1 — 원본은 계약서를 만든 뒤 [수신정보입력]에서 사원을 고른다. 고르기 전에는 비어 있다. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "employee_id")
    private Employee employee;

    /** 예전 구조화 계약의 유형. 계약서입력 모델(첨부 PDF)로 만든 계약은 비어 있다. */
    @Enumerated(EnumType.STRING)
    @Column(length = 20)
    private ContractType type;

    /** 원본 계약서입력 [계약서명] */
    @Column(name = "contract_name", length = 100)
    private String contractName;

    /** 원본 계약서입력 [첨부] — PDF 필수. 공용 파일 저장(stored_files)에 올린 파일. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "attachment_file_id")
    private com.erp.common.StoredFile attachment;

    /** 원본 [2차인증사용여부] */
    @Column(name = "two_factor", nullable = false)
    @Builder.Default
    private boolean twoFactor = false;

    /** 원본 [구분] — 격자 [구분명] */
    @Column(length = 50)
    private String category;

    /** 원본 [프로젝트]. hr 은 inventory 를 참조하지 않으므로 id 만 든다(CLAUDE.md 4.1). */
    @Column(name = "project_id")
    private Long projectId;

    /** 수신정보입력 [전달방식] */
    @Enumerated(EnumType.STRING)
    @Column(name = "delivery_method", length = 20)
    private DeliveryMethod deliveryMethod;

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

    /** 발송한 때 — 원본 근로계약현황 [요청일시] */
    @Column(name = "sent_at")
    private LocalDateTime sentAt;

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
