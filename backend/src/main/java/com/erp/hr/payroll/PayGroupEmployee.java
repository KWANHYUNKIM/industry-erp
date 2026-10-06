package com.erp.hr.payroll;

import com.erp.hr.employee.Employee;
import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;

/**
 * 원본 수당/공제그룹등록(E090104)의 <b>[적용사원등록]</b> 한 줄 — 이 그룹을 받는 사원과 [지급율(%)].
 * 사원 한 명은 그룹 하나에만 든다(급여계산이 사원의 그룹을 하나로 찾아야 한다).
 */
@Entity
@Table(name = "pay_group_employees",
        uniqueConstraints = @UniqueConstraint(name = "uk_pay_group_employees_employee", columnNames = {"employee_id"}))
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class PayGroupEmployee {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "group_id", nullable = false)
    private PayGroup group;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "employee_id", nullable = false)
    private Employee employee;

    /** 원본 [지급율(%)]. 그룹 금액에 이 비율을 곱해 명세에 넣는다. 비우면 100. */
    @Column(nullable = false, precision = 7, scale = 2)
    @Builder.Default
    private BigDecimal rate = BigDecimal.valueOf(100);
}
