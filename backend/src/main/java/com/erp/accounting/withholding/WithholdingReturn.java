package com.erp.accounting.withholding;

import com.erp.common.BaseTimeEntity;
import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDate;

/**
 * 원천징수이행상황신고서 한 장. 원본(E030101)은 [신규]로 신고서를 만들어 목록에 두고 연다.
 * 금액은 들고 있지 않다 — 열 때마다 귀속연월의 확정 급여명세 · 일용근로 · 기타원천세에서 센다.
 */
@Entity
@Table(name = "withholding_returns")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class WithholdingReturn extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Enumerated(EnumType.STRING)
    @Column(name = "filing_type", nullable = false, length = 20)
    private WithholdingFilingType filingType;

    @Enumerated(EnumType.STRING)
    @Column(name = "filing_method", nullable = false, length = 20)
    private WithholdingFilingMethod filingMethod;

    /** YYYY-MM */
    @Column(name = "attribution_month", nullable = false, length = 7)
    private String attributionMonth;

    /** YYYY-MM */
    @Column(name = "pay_month", nullable = false, length = 7)
    private String payMonth;

    @Column(name = "report_date", nullable = false)
    private LocalDate reportDate;

    @Column(name = "include_year_end", nullable = false)
    private boolean includeYearEnd;

    /** 원본 [소득자료반영기준] ○직접지정 — 켜면 귀속연월 대신 {@link #payLedgerIds} 의 급여대장을 싣는다. */
    @Column(name = "direct_income", nullable = false)
    private boolean directIncome;

    /** 직접지정에서 [급여대장] 으로 고른 대장 id(쉼표로 이음). */
    @Column(name = "pay_ledger_ids", length = 500)
    private String payLedgerIds;

    public java.util.List<Long> ledgerIds() {
        if (payLedgerIds == null || payLedgerIds.isBlank()) return java.util.List.of();
        return java.util.Arrays.stream(payLedgerIds.split(",")).map(String::trim).filter(x -> !x.isEmpty()).map(Long::valueOf).toList();
    }
}
