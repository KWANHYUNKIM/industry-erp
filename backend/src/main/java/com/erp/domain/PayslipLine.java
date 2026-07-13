package com.erp.domain;

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

    @Column(name = "line_no", nullable = false)
    @Builder.Default
    private Integer lineNo = 1;
}
