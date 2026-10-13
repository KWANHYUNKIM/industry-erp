package com.erp.accounting.vatreturn.dto;

import com.erp.accounting.vatreturn.VatFilingType;
import com.erp.accounting.vatreturn.VatReturn;
import com.erp.accounting.vatreturn.VatReturnKind;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

import java.time.LocalDate;
import java.time.LocalDateTime;

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

    /** [신고서등] 창 한 줄 — 저장된 서류와 마지막으로 만든 때(원본 '부가세신고서 최종수정일 … 이후로 수정된 서류'). */
    public record VatReturnDocSummary(String docCode, LocalDateTime writtenAt) {}

    /** 서류 한 장 — data 는 화면이 센 숫자(JSON 글자). */
    public record VatReturnDocResponse(String docCode, String data, LocalDateTime writtenAt) {}

    public record VatReturnDocRequest(@NotNull(message = "서류 내용이 없습니다.") String data) {}
}
