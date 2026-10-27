package com.erp.hr.workrecord;

import com.erp.hr.employee.Employee;
import com.erp.hr.payroll.PayItem;
import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;

/**
 * 원본 급여계산/대장 [사전작업] &gt; <b>근무기록확정</b> 한 칸 — 그 귀속월(대장)에 사원 · 변동수당 항목별로 확정한 근무기록.
 *
 * <p>원본 계산식 'R( 야근수당(급여지급사항) * 야근수당(<b>근무기록확정</b>) , 0 )' 의 뒤쪽이 이것이다 — 급여계산은
 * 근무입력을 바로 쓰지 않고 여기 확정한 값을 쓴다. [근무기록] 단추가 근무입력의 그 달 합계를 불러와 채운다.
 */
@Entity
@Table(name = "work_confirms",
        uniqueConstraints = @UniqueConstraint(name = "uk_work_confirms_month_emp_item",
                columnNames = {"pay_month", "employee_id", "pay_item_id"}))
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class WorkConfirm {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "pay_month", nullable = false, length = 7)
    private String payMonth;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "employee_id", nullable = false)
    private Employee employee;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "pay_item_id", nullable = false)
    private PayItem payItem;

    @Column(nullable = false, precision = 10, scale = 2)
    private BigDecimal quantity;
}
