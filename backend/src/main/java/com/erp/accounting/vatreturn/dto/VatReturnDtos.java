package com.erp.accounting.vatreturn.dto;

import com.erp.accounting.vatreturn.VatFilingType;
import com.erp.accounting.vatreturn.VatReturn;
import com.erp.accounting.vatreturn.VatReturnKind;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

import java.time.LocalDate;

public final class VatReturnDtos {

    private VatReturnDtos() {}

    /**
     * 등록 · 수정. 예정 · 확정은 term(1 · 2)로 석 달을 정하고, 월별은 month 한 달이다.
     * 수정에서는 filingType · reportDate · dueDate · taxAgent · closure 만 바뀐다.
     */
    public record VatReturnRequest(
            @NotNull(message = "신고구분을 선택하세요.") VatFilingType filingType,
            @NotNull(message = "신고서종류를 선택하세요.") VatReturnKind returnKind,
            @NotNull(message = "신고기간을 선택하세요.") @Min(2000) @Max(2999) Integer year,
            @Min(1) @Max(2) Integer term,
            @Min(1) @Max(12) Integer month,
            @NotNull(message = "신고작성일자를 입력하세요.") LocalDate reportDate,
            @NotNull(message = "납부기한을 입력하세요.") LocalDate dueDate,
            boolean taxAgent,
            boolean closure
    ) {}

    public record VatReturnResponse(
            Long id, VatFilingType filingType, String filingTypeName,
            VatReturnKind returnKind, Integer year, Integer monthFrom, Integer monthTo,
            Integer omittedFrom, Integer omittedTo, boolean includesOmitted,
            /** 원본 [신고기간] 글자 — '2026년 2기 예정(7~9)' · '2024년 05월 - 05월'. */
            String periodName,
            LocalDate reportDate, LocalDate dueDate, boolean taxAgent, boolean closure
    ) {
        public static VatReturnResponse from(VatReturn v) {
            String name = v.getReturnKind() == VatReturnKind.MONTHLY
                    ? String.format("%d년 %02d월 - %02d월", v.getAttributionYear(), v.getMonthFrom(), v.getMonthTo())
                    : String.format("%d년 %d기 %s(%d~%d)", v.getAttributionYear(), v.getMonthFrom() <= 6 ? 1 : 2,
                            v.getReturnKind().getDisplayName(), v.getMonthFrom(), v.getMonthTo());
            return new VatReturnResponse(v.getId(), v.getFilingType(), v.getFilingType().getDisplayName(),
                    v.getReturnKind(), v.getAttributionYear(), v.getMonthFrom(), v.getMonthTo(),
                    v.getOmittedFrom(), v.getOmittedTo(), v.getOmittedFrom() != null, name,
                    v.getReportDate(), v.getDueDate(), v.isTaxAgent(), v.isClosure());
        }
    }
}
