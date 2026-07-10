package com.erp.domain;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDate;

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

    /** 소속 부서 */
    @Column(length = 100)
    private String department;

    /** 직위. 컬럼명이 position 이면 SQL 예약어와 부딪히므로 job_title 을 쓴다. */
    @Column(name = "job_title", length = 100)
    private String jobTitle;

    /** 입사일 */
    private LocalDate hireDate;

    @Column(nullable = false)
    @Builder.Default
    private boolean active = true;
}
