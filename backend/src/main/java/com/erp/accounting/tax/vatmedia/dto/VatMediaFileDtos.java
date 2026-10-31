package com.erp.accounting.tax.vatmedia.dto;

import com.erp.accounting.tax.vatmedia.VatMediaFile;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

import java.time.LocalDate;

public final class VatMediaFileDtos {

    private VatMediaFileDtos() {}

    /** 등록. 수정에서는 reportDate 만 바뀐다. */
    public record VatMediaFileRequest(
            @NotNull(message = "신고기간을 선택하세요.") @Min(2000) @Max(2999) Integer year,
            @NotNull(message = "신고기간을 선택하세요.") @Min(1) @Max(12) Integer monthFrom,
            @NotNull(message = "신고기간을 선택하세요.") @Min(1) @Max(12) Integer monthTo,
            @Min(1) @Max(12) Integer omittedFrom,
            @Min(1) @Max(12) Integer omittedTo,
            boolean invoiceSummary,
            boolean taxInvoiceSummary,
            @NotNull(message = "신고작성일자를 입력하세요.") LocalDate reportDate
    ) {}

    public record VatMediaFileResponse(
            Long id, Integer year, Integer monthFrom, Integer monthTo, Integer omittedFrom, Integer omittedTo,
            boolean invoiceSummary, boolean taxInvoiceSummary,
            /** 원본 [자료구분] — 전체 · 계산서합계표 · 세금계산서합계표. */
            String kindName,
            LocalDate reportDate
    ) {
        public static VatMediaFileResponse from(VatMediaFile v) {
            String kind = v.isInvoiceSummary() && v.isTaxInvoiceSummary() ? "전체"
                    : v.isInvoiceSummary() ? "계산서합계표" : "세금계산서합계표";
            return new VatMediaFileResponse(v.getId(), v.getAttributionYear(), v.getMonthFrom(), v.getMonthTo(),
                    v.getOmittedFrom(), v.getOmittedTo(), v.isInvoiceSummary(), v.isTaxInvoiceSummary(), kind, v.getReportDate());
        }
    }
}
