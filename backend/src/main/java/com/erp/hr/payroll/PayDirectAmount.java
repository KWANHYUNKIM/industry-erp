package com.erp.hr.payroll;

import com.erp.common.BaseTimeEntity;
import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;

/**
 * 원본 급여계산/대장 [사전작업] <b>금액직접입력</b>의 칸 하나 — 귀속월 · 사원 · 항목(기본급 · 수당 · 공제)마다 손으로 정한 금액.
 * 급여계산이 그 항목의 셈 대신 이 금액을 쓴다. 항목은 명세 줄 이름 그대로 든다(지방소득세 · 장기요양보험 …).
 */
@Entity
@Table(name = "pay_direct_amounts")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class PayDirectAmount extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "pay_month", nullable = false, length = 7)
    private String payMonth;

    @Column(name = "employee_id", nullable = false)
    private Long employeeId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private PayslipLineKind kind;

    @Column(name = "item_name", nullable = false, length = 100)
    private String itemName;

    @Column(nullable = false, precision = 18, scale = 2)
    private BigDecimal amount;

    @Column(length = 200)
    private String memo;
}
