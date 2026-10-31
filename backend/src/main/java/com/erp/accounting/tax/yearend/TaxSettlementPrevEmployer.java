package com.erp.accounting.tax.yearend;

import com.erp.common.BaseTimeEntity;
import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDate;

/** 종(전)근무지 및 납세조합 한 줄 — 원본 [수정] 창(plans/세무/연말정산.md 3.1). 금액은 원 단위. */
@Entity
@Table(name = "tax_settlement_prev_employers")
@Getter
@Setter
@NoArgsConstructor
public class TaxSettlementPrevEmployer extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "settlement_id")
    private TaxSettlement settlement;

    @Column(name = "line_no", nullable = false)
    private int lineNo;

    /** (10) 사업자등록번호 — 필수(원본 `사업자등록번호를 입력하세요.`) */
    @Column(name = "biz_no", nullable = false, length = 12)
    private String bizNo;
    /** (9) 근무처명 */
    @Column(name = "company_name", length = 100)
    private String companyName;
    /** (11) 근무기간 */
    @Column(name = "period_from") private LocalDate periodFrom;
    @Column(name = "period_to") private LocalDate periodTo;

    /** (13) 급여 · (14) 상여 · (15) 인정상여 ~ (15)-4 합 */
    @Column(nullable = false) private long salary;
    @Column(nullable = false) private long bonus;
    @Column(name = "other_pay", nullable = false) private long otherPay;
    /** 비과세소득 계 · 감면소득 계 — 총급여에 넣지 않는다 */
    @Column(name = "non_taxable", nullable = false) private long nonTaxable;
    @Column(name = "reduced_income", nullable = false) private long reducedIncome;

    @Column(name = "national_pension", nullable = false) private long nationalPension;
    @Column(name = "other_pension", nullable = false) private long otherPension;
    @Column(name = "health_insurance", nullable = false) private long healthInsurance;
    @Column(name = "employment_insurance", nullable = false) private long employmentInsurance;

    /** (73) 결정세액 — 정산의 기납부 종(전)(74) 이 된다 */
    @Column(name = "decided_income_tax", nullable = false) private long decidedIncomeTax;
    @Column(name = "decided_local_tax", nullable = false) private long decidedLocalTax;
    @Column(name = "decided_rural_tax", nullable = false) private long decidedRuralTax;

    /** (16) 합계 = 과세소득 계 */
    public long taxablePay() {
        return salary + bonus + otherPay;
    }
}
