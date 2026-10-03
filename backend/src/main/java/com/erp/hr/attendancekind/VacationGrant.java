package com.erp.hr.attendancekind;

import com.erp.hr.employee.Employee;
import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;

/**
 * 사원별휴가일수(원본 E020703 사원별휴가일수입력) — 휴가항목마다 사원의 이월 잔여일수 · 당해년 휴가일수.
 * 휴가일수 = 이월 잔여일수 + 당해년 휴가일수(원본 격자가 그렇게 더한다).
 */
@Entity
@Table(name = "vacation_grants")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class VacationGrant {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "vacation_kind_id")
    private VacationKind vacationKind;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "employee_id")
    private Employee employee;

    @Column(name = "carry_over_days", nullable = false, precision = 6, scale = 2)
    private BigDecimal carryOverDays;

    @Column(name = "current_days", nullable = false, precision = 6, scale = 2)
    private BigDecimal currentDays;
}
