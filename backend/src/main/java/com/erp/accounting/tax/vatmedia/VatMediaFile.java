package com.erp.accounting.tax.vatmedia;

import com.erp.common.BaseTimeEntity;
import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDate;

/**
 * 과세자료전산매체(원본 E030208) 목록의 한 줄 — [신규(F2)] '전산매체 파일생성' 창으로 만든다(2026-10-12 loginaa 실측).
 * 합계표 숫자는 들고 있지 않다 — [합계표 › 조회] 때마다 그 기간의 회계전표 · (세금)계산서발행/수령에서 센다.
 * 수정 창에서는 신고작성일자만 고친다.
 */
@Entity
@Table(name = "vat_media_files")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class VatMediaFile extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "attribution_year", nullable = false)
    private Integer attributionYear;

    @Column(name = "month_from", nullable = false)
    private Integer monthFrom;

    @Column(name = "month_to", nullable = false)
    private Integer monthTo;

    @Column(name = "omitted_from")
    private Integer omittedFrom;

    @Column(name = "omitted_to")
    private Integer omittedTo;

    /** 전산매체 [계산서합계표]. */
    @Column(name = "invoice_summary", nullable = false)
    private boolean invoiceSummary;

    /** 전산매체 [세금계산서합계표]. */
    @Column(name = "tax_invoice_summary", nullable = false)
    private boolean taxInvoiceSummary;

    @Column(name = "report_date", nullable = false)
    private LocalDate reportDate;
}
