package com.erp.hr.payroll;

import com.erp.common.BaseTimeEntity;
import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDate;

/**
 * 원본 관리 &gt; 급여작업 &gt; <b>급여계산/대장</b>(E090106)의 대장 한 줄 — '2026/10 급여'.
 *
 * <p>원본은 같은 귀속월에 대장을 여럿(-1, -2 …) 둘 수 있지만, 우리 급여명세는 사원 · 귀속월이 하나라
 * (uk_payslips_employee_month) 대장도 귀속월에 하나다. 대장의 명세는 귀속월로 묶는다.
 */
@Entity
@Table(name = "pay_ledgers")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class PayLedger extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** 원본 [귀속연월] (YYYY-MM). */
    @Column(name = "pay_month", nullable = false, unique = true, length = 7)
    private String payMonth;

    /** 원본 [급여대장명칭]. 비우면 'YYYY/MM 급여'. */
    @Column(nullable = false, length = 100)
    private String name;

    /** 원본 [지급일]. */
    @Column(name = "pay_date", nullable = false)
    private LocalDate payDate;

    @Column(name = "created_by", length = 50)
    private String createdBy;
}
