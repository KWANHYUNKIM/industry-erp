package com.erp.hr.employee;

import com.erp.hr.department.Department;
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

    /** 원본 사원등록 [입사구분] — 코드도움 100 신입 · 200 경력, 고른 이름을 담는다. */
    @Column(name = "hire_kind", length = 20)
    private String hireKind;

    /** 원본 사원등록 [직책] — 코드도움 100 팀원 · 200 팀장, 고른 이름을 담는다. */
    @Column(name = "duty", length = 20)
    private String duty;

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

    /**
     * 원본 <b>[담당자연락처]</b>·<b>[담당자Email]</b>. 사원등록이 곧 <b>담당자 등록</b>이라
     * (원본 이름이 '사원(담당)등록' 이다) 전표의 담당자에게 연락할 길이 여기 있어야 한다.
     * 전에는 이름만 있어서, 어느 건을 누가 맡았는지는 알아도 <b>연락할 데는 없었다.</b>
     */
    @Column(length = 30)
    private String phone;

    @Column(length = 100)
    private String email;

    /** 원본 <b>[검색창내용]</b>. 부르는 이름으로 찾는다(거래처·품목과 같다). */
    @Column(name = "search_keyword", length = 100)
    private String searchKeyword;

    /** 원본 <b>[적요]</b>. 사원에 남기는 메모. */
    @Column(length = 200)
    private String remark;

    /** 원본 관리 &gt; 사원등록의 [급여구분]. 고정급 · 변동급. */
    @Enumerated(EnumType.STRING)
    @Column(name = "pay_type", nullable = false, length = 10)
    @Builder.Default
    private PayType payType = PayType.FIXED;

    /** 원본 [모바일]. [전화](phone)와 따로 둔다. */
    @Column(length = 30)
    private String mobile;

    /** 원본 [퇴사사유]. */
    @Column(name = "resign_reason", length = 100)
    private String resignReason;

    /** 원본 [외국어성명1] · [외국어성명2] — 성명 아래 칸. */
    @Column(name = "foreign_name1", length = 100)
    private String foreignName1;

    @Column(name = "foreign_name2", length = 100)
    private String foreignName2;

    /** 원본 [세대주여부] — 세대주 · 세대원 · 세대주의 배우자(원본 처음 값 세대주). */
    @Column(length = 20)
    private String household;

    /** 원본 [우편번호] — 주소 앞 칸. */
    @Column(length = 10)
    private String zipcode;

    /** 원본 [주소]. */
    @Column(length = 200)
    private String address;

    /** 원본 사원등록 [급여통장] — 은행 · 계좌번호 · 예금주. 급여이체현황이 이것으로 이체 목록을 만든다. */
    @Column(name = "bank_code", length = 10)
    private String bankCode;

    @Column(name = "bank_name", length = 50)
    private String bankName;

    @Column(name = "account_no", length = 50)
    private String accountNo;

    @Column(name = "account_holder", length = 50)
    private String accountHolder;
}
