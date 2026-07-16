package com.erp.hr.domain;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;

/** 급여명세 라인. 수당(ALLOWANCE) 또는 공제(DEDUCTION) 항목 하나. */
@Entity
@Table(name = "payslip_lines")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class PayslipLine {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "payslip_id", nullable = false)
    private Payslip payslip;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private PayslipLineKind kind;

    @Column(nullable = false, length = 100)
    private String name;

    @Column(nullable = false, precision = 18, scale = 2)
    @Builder.Default
    private BigDecimal amount = BigDecimal.ZERO;

    /** 4대보험처럼 자동 계산된 항목인지. */
    @Column(nullable = false)
    @Builder.Default
    private boolean auto = false;

    /**
     * 과세 대상 수당인지. 식대 같은 비과세 수당은 4대보험·소득세 기준(과세소득)에서 빠진다.
     * 공제 라인에서는 의미가 없다(기본 true 로 두고 쓰지 않는다).
     */
    @Column(nullable = false)
    @Builder.Default
    private boolean taxable = true;

    @Column(name = "line_no", nullable = false)
    @Builder.Default
    private Integer lineNo = 1;
}
