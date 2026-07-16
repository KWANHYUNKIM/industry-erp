package com.erp.hr.domain;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import com.erp.common.BaseTimeEntity;

/**
 * 급여명세. 사원 1명 × 귀속월 1건. 실지급액 = 기본급 + 수당합 − 공제합.
 */
@Entity
@Table(name = "payslips")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class Payslip extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "employee_id", nullable = false)
    private Employee employee;

    /** 귀속월 (YYYY-MM) */
    @Column(name = "pay_month", nullable = false, length = 7)
    private String payMonth;

    @Column(name = "base_salary", nullable = false, precision = 18, scale = 2)
    @Builder.Default
    private BigDecimal baseSalary = BigDecimal.ZERO;

    @Column(name = "allowance_total", nullable = false, precision = 18, scale = 2)
    @Builder.Default
    private BigDecimal allowanceTotal = BigDecimal.ZERO;

    @Column(name = "deduction_total", nullable = false, precision = 18, scale = 2)
    @Builder.Default
    private BigDecimal deductionTotal = BigDecimal.ZERO;

    @Column(name = "net_pay", nullable = false, precision = 18, scale = 2)
    @Builder.Default
    private BigDecimal netPay = BigDecimal.ZERO;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    @Builder.Default
    private PayslipStatus status = PayslipStatus.DRAFT;

    @Column(length = 300)
    private String remark;

    @Column(name = "created_by", length = 50)
    private String createdBy;

    @OneToMany(mappedBy = "payslip", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("lineNo asc")
    @Builder.Default
    private List<PayslipLine> lines = new ArrayList<>();

    public void addLine(PayslipLine line) {
        line.setPayslip(this);
        line.setLineNo(this.lines.size() + 1);
        this.lines.add(line);
    }

    /** 라인 합계로 지급/공제/실지급액을 다시 계산한다. */
    public void recalculate() {
        this.allowanceTotal = sum(PayslipLineKind.ALLOWANCE);
        this.deductionTotal = sum(PayslipLineKind.DEDUCTION);
        this.netPay = baseSalary.add(allowanceTotal).subtract(deductionTotal);
    }

    private BigDecimal sum(PayslipLineKind kind) {
        return lines.stream()
                .filter(l -> l.getKind() == kind)
                .map(PayslipLine::getAmount)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    /** 지급총액 (기본급 + 수당) */
    public BigDecimal grossPay() {
        return baseSalary.add(allowanceTotal);
    }
}
