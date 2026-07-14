package com.erp.domain;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;

/**
 * 이체 한 줄 = 급여명세 한 건.
 * payslip_id 가 유니크라서 같은 명세를 두 번 이체할 수 없다(DB 가 막는다).
 */
@Entity
@Table(name = "payroll_transfer_lines",
        uniqueConstraints = @UniqueConstraint(name = "uk_payroll_transfer_lines_payslip",
                columnNames = {"payslip_id"}))
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class PayrollTransferLine {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "transfer_id", nullable = false)
    private PayrollTransfer transfer;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "payslip_id", nullable = false)
    private Payslip payslip;

    /** 이 사원의 실지급액 */
    @Column(nullable = false, precision = 18, scale = 2)
    private BigDecimal netPay;
}
