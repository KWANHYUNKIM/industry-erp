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
}
