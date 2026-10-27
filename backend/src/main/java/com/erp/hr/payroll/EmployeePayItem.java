package com.erp.hr.payroll;

import com.erp.common.BaseTimeEntity;
import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;

/**
 * 원본 사원등록(E090101) <b>[급여지급사항]</b> 한 칸 — 사원 · 수당/공제항목마다의 금액.
 * 고정수당 · 월정공제는 이 금액이 그대로 명세 줄이 되고, 일급수당 · 시급수당은 단가다
 * (원본 계산식 '야근수당(급여지급사항) * 야근수당(근무기록확정)'). 수당/공제그룹보다 앞선다.
 */
@Entity
@Table(name = "employee_pay_items",
        uniqueConstraints = @UniqueConstraint(name = "uk_employee_pay_items", columnNames = {"employee_id", "pay_item_id"}))
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class EmployeePayItem extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "employee_id", nullable = false)
    private Long employeeId;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "pay_item_id", nullable = false)
    private PayItem payItem;

    @Column(nullable = false, precision = 18, scale = 2)
    private BigDecimal amount;
}
