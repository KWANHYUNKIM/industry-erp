package com.erp.domain;

import com.erp.domain.enums.IncomeType;
import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * 기타원천세. 근로소득 외의 지급(사업·기타·이자·배당)에 붙는 원천징수 기록.
 * 세액은 등록 시점에 계산해 박아 둔다 — 세율이 바뀌어도 과거 지급은 그대로여야 한다.
 */
@Entity
@Table(name = "other_withholdings")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class OtherWithholding extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** 지급번호 (WT-yyyyMMdd-NNNN) */
    @Column(name = "doc_no", nullable = false, unique = true, length = 30)
    private String docNo;

    @Column(name = "pay_date", nullable = false)
    private LocalDate payDate;

    @Enumerated(EnumType.STRING)
    @Column(name = "income_type", nullable = false, length = 20)
    private IncomeType incomeType;

    /** 거래처로 지급하는 경우. 개인이면 null 이고 payeeName 만 남는다. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "partner_id")
    private BusinessPartner partner;

    @Column(name = "payee_name", nullable = false, length = 100)
    private String payeeName;

    /** 사업자등록번호 또는 주민등록번호 */
    @Column(name = "payee_reg_no", length = 20)
    private String payeeRegNo;

    @Column(name = "gross_amount", nullable = false, precision = 18, scale = 2)
    private BigDecimal grossAmount;

    /** 필요경비 (기타소득 60%, 나머지 0) */
    @Column(name = "expense_amount", nullable = false, precision = 18, scale = 2)
    @Builder.Default
    private BigDecimal expenseAmount = BigDecimal.ZERO;

    @Column(name = "taxable_amount", nullable = false, precision = 18, scale = 2)
    @Builder.Default
    private BigDecimal taxableAmount = BigDecimal.ZERO;

    @Column(name = "income_tax", nullable = false, precision = 18, scale = 2)
    @Builder.Default
    private BigDecimal incomeTax = BigDecimal.ZERO;

    @Column(name = "local_income_tax", nullable = false, precision = 18, scale = 2)
    @Builder.Default
    private BigDecimal localIncomeTax = BigDecimal.ZERO;

    /** 실지급액 = 지급액 − 소득세 − 지방소득세 */
    @Column(name = "net_amount", nullable = false, precision = 18, scale = 2)
    @Builder.Default
    private BigDecimal netAmount = BigDecimal.ZERO;

    @Column(length = 200)
    private String description;

    @Column(name = "created_by", length = 50)
    private String createdBy;
}
