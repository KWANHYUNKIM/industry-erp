package com.erp.domain;

import com.erp.domain.enums.TaxReturnStatus;
import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

/**
 * 법인세 신고서. 결산서상 당기순이익에서 세무조정을 거쳐 과세표준·산출세액을 낸다.
 * 계산된 금액은 저장해 둔다 — 세율이 바뀌어도 과거 신고서는 그대로여야 한다.
 */
@Entity
@Table(name = "corporate_tax_returns")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class CorporateTaxReturn extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "fiscal_year", nullable = false, unique = true)
    private int fiscalYear;

    @Column(name = "period_from", nullable = false)
    private LocalDate periodFrom;

    @Column(name = "period_to", nullable = false)
    private LocalDate periodTo;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    @Builder.Default
    private TaxReturnStatus status = TaxReturnStatus.DRAFT;

    /** 손익계산서에서 가져온 결산서상 당기순이익 */
    @Column(name = "net_income", nullable = false, precision = 18, scale = 2)
    @Builder.Default
    private BigDecimal netIncome = BigDecimal.ZERO;

    @Column(nullable = false, precision = 18, scale = 2)
    @Builder.Default
    private BigDecimal additions = BigDecimal.ZERO;

    @Column(nullable = false, precision = 18, scale = 2)
    @Builder.Default
    private BigDecimal deductions = BigDecimal.ZERO;

    @Column(name = "loss_carryforward", nullable = false, precision = 18, scale = 2)
    @Builder.Default
    private BigDecimal lossCarryforward = BigDecimal.ZERO;

    @Column(name = "tax_base", nullable = false, precision = 18, scale = 2)
    @Builder.Default
    private BigDecimal taxBase = BigDecimal.ZERO;

    @Column(name = "calculated_tax", nullable = false, precision = 18, scale = 2)
    @Builder.Default
    private BigDecimal calculatedTax = BigDecimal.ZERO;

    @Column(name = "tax_credit", nullable = false, precision = 18, scale = 2)
    @Builder.Default
    private BigDecimal taxCredit = BigDecimal.ZERO;

    @Column(name = "penalty_tax", nullable = false, precision = 18, scale = 2)
    @Builder.Default
    private BigDecimal penaltyTax = BigDecimal.ZERO;

    @Column(name = "total_tax", nullable = false, precision = 18, scale = 2)
    @Builder.Default
    private BigDecimal totalTax = BigDecimal.ZERO;

    /** 중간예납·원천납부 등 이미 낸 세금 */
    @Column(name = "prepaid_tax", nullable = false, precision = 18, scale = 2)
    @Builder.Default
    private BigDecimal prepaidTax = BigDecimal.ZERO;

    @Column(name = "payable_tax", nullable = false, precision = 18, scale = 2)
    @Builder.Default
    private BigDecimal payableTax = BigDecimal.ZERO;

    /** 법인지방소득세 = 산출세액의 10% */
    @Column(name = "local_income_tax", nullable = false, precision = 18, scale = 2)
    @Builder.Default
    private BigDecimal localIncomeTax = BigDecimal.ZERO;

    @Column(length = 500)
    private String remark;

    @Column(name = "created_by", length = 50)
    private String createdBy;

    @OneToMany(mappedBy = "taxReturn", cascade = CascadeType.ALL, orphanRemoval = true)
    @Builder.Default
    private List<CorporateTaxAdjustment> adjustments = new ArrayList<>();
}
