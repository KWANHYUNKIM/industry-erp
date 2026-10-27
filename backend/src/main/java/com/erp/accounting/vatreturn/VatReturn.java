package com.erp.accounting.vatreturn;

import com.erp.common.BaseTimeEntity;
import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDate;

/**
 * 부가세신고서(일반) 목록의 신고서 한 장 — 원본 E200928 [신규(F2)] 창(2026-10-12 loginaa 실측).
 * 금액은 들고 있지 않다 — [신고서등 › 조회] 때마다 그 기간의 회계전표 · (세금)계산서발행/수령에서 센다.
 * 수정 창에서는 신고서종류 · 신고기간 · 예정누락이 막히고 신고구분 · 날짜 · 여부만 고친다.
 */
@Entity
@Table(name = "vat_returns")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class VatReturn extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Enumerated(EnumType.STRING)
    @Column(name = "filing_type", nullable = false, length = 10)
    private VatFilingType filingType;

    @Enumerated(EnumType.STRING)
    @Column(name = "return_kind", nullable = false, length = 10)
    private VatReturnKind returnKind;

    @Column(name = "attribution_year", nullable = false)
    private Integer attributionYear;

    @Column(name = "month_from", nullable = false)
    private Integer monthFrom;

    @Column(name = "month_to", nullable = false)
    private Integer monthTo;

    /** 예정누락 — 확정 신고서에 싣는 그 기의 예정 석 달. 예정 · 월별이면 null. */
    @Column(name = "omitted_from")
    private Integer omittedFrom;

    @Column(name = "omitted_to")
    private Integer omittedTo;

    @Column(name = "report_date", nullable = false)
    private LocalDate reportDate;

    @Column(name = "due_date", nullable = false)
    private LocalDate dueDate;

    @Column(name = "tax_agent", nullable = false)
    private boolean taxAgent;

    @Column(name = "closure", nullable = false)
    private boolean closure;
}
