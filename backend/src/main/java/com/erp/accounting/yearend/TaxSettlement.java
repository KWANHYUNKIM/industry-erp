package com.erp.accounting.yearend;

import com.erp.common.BaseTimeEntity;
import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

/**
 * 정산 한 건 — (귀속연도 · 사원 · 종류) 하나. 공제 입력(종전근무지 · 공제 줄)과 계산 결과(원천징수영수증 칸)를 같이 든다.
 *
 * <p>사원은 {@code Long employeeId} 로만 든다 — accounting 이 hr 엔티티를 새로 참조하지 않게(CLAUDE.md 4.1, accounting → hr 은 부채).
 * 주(현)근무지 한 해 급여(cur_*)는 hr 이 확정 급여명세에서 모아 {@link TaxSettlementService#calculate} 로 넣는다.
 * 금액은 원 단위 long(bigint).
 */
@Entity
@Table(name = "tax_settlements")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class TaxSettlement extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "attribution_year", nullable = false)
    private int attributionYear;

    @Column(name = "employee_id", nullable = false)
    private Long employeeId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private TaxSettlementKind kind;

    /** 원천징수연월 YYYY-MM — 중도정산만(원본 연말정산은 계산처리 뒤에도 빈칸). */
    @Column(name = "withholding_month", length = 7)
    private String withholdingMonth;

    /** 계산설정 — 표준세액공제 자동계산 / 자녀세액공제 적용 / 단일세율 미적용(원본 기본값). */
    @Column(name = "standard_auto", nullable = false)
    private boolean standardAuto = true;
    @Column(name = "child_credit", nullable = false)
    private boolean childCredit = true;
    @Column(name = "single_rate", nullable = false)
    private boolean singleRate;

    @Column(name = "basic_deduction_count", nullable = false)
    private int basicDeductionCount = 1;

    @Column(length = 500)
    private String memo;

    @Column(name = "calculated_at")
    private LocalDateTime calculatedAt;

    // ── 주(현)근무지 한 해 급여 — hr 이 넣는다 ──
    @Column(name = "cur_total_pay", nullable = false) private long curTotalPay;
    @Column(name = "cur_non_taxable", nullable = false) private long curNonTaxable;
    @Column(name = "cur_national_pension", nullable = false) private long curNationalPension;
    @Column(name = "cur_health_insurance", nullable = false) private long curHealthInsurance;
    @Column(name = "cur_employment_insurance", nullable = false) private long curEmploymentInsurance;
    @Column(name = "cur_income_tax", nullable = false) private long curIncomeTax;
    @Column(name = "cur_local_tax", nullable = false) private long curLocalTax;

    // ── 계산 결과(원천징수영수증 칸) ──
    @Column(name = "total_salary", nullable = false) private long totalSalary;
    @Column(name = "earned_income_deduction", nullable = false) private long earnedIncomeDeduction;
    @Column(name = "earned_income_amount", nullable = false) private long earnedIncomeAmount;
    @Column(name = "income_deduction_total", nullable = false) private long incomeDeductionTotal;
    @Column(name = "tax_base", nullable = false) private long taxBase;
    @Column(name = "computed_tax", nullable = false) private long computedTax;
    @Column(name = "tax_reduction", nullable = false) private long taxReduction;
    @Column(name = "tax_credit_total", nullable = false) private long taxCreditTotal;
    @Column(name = "standard_tax_credit", nullable = false) private long standardTaxCredit;
    @Column(name = "decided_income_tax", nullable = false) private long decidedIncomeTax;
    @Column(name = "decided_local_tax", nullable = false) private long decidedLocalTax;
    @Column(name = "decided_rural_tax", nullable = false) private long decidedRuralTax;
    @Column(name = "prev_income_tax", nullable = false) private long prevIncomeTax;
    @Column(name = "prev_local_tax", nullable = false) private long prevLocalTax;
    @Column(name = "balance_income_tax", nullable = false) private long balanceIncomeTax;
    @Column(name = "balance_local_tax", nullable = false) private long balanceLocalTax;

    @OneToMany(mappedBy = "settlement", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("lineNo asc")
    private List<TaxSettlementPrevEmployer> prevEmployers = new ArrayList<>();

    @OneToMany(mappedBy = "settlement", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("lineNo asc")
    private List<TaxSettlementDeduction> deductions = new ArrayList<>();

    public static TaxSettlement of(int attributionYear, Long employeeId, TaxSettlementKind kind) {
        TaxSettlement s = new TaxSettlement();
        s.attributionYear = attributionYear;
        s.employeeId = employeeId;
        s.kind = kind;
        return s;
    }
}
