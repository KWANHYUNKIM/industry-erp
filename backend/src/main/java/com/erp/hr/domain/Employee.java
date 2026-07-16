package com.erp.hr.domain;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.LocalDate;
import com.erp.common.BaseTimeEntity;

/**
 * 사원 마스터. 생산 작업자처럼 로그인 계정(User)이 필요 없는 인원을 관리한다.
 */
@Entity
@Table(name = "employees")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class Employee extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** 사번 (예: EMP-0001) */
    @Column(nullable = false, unique = true, length = 50)
    private String code;

    /** 성명 */
    @Column(nullable = false, length = 100)
    private String name;

    /** 소속 부서. 미배치면 null */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "department_id")
    private Department department;

    /** 직위. 컬럼명이 position 이면 SQL 예약어와 부딪히므로 job_title 을 쓴다. */
    @Column(name = "job_title", length = 100)
    private String jobTitle;

    /** 입사일 */
    private LocalDate hireDate;

    /** 퇴사일. 재직 중이면 null */
    @Column(name = "resign_date")
    private LocalDate resignDate;

    /** 월 기본급. 급여명세 생성 시 기본값으로 복사된다. */
    @Column(name = "base_salary", nullable = false, precision = 18, scale = 2)
    @Builder.Default
    private BigDecimal baseSalary = BigDecimal.ZERO;

    @Column(nullable = false)
    @Builder.Default
    private boolean active = true;
}
