package com.erp.accounting.statementsheet.dto;

import com.erp.accounting.statementsheet.StatementSheetKind;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

public class StatementSheetDtos {

    /** 항목 한 줄 — key 는 화면이 정한 자리(cf.op · re.i1 …), label 은 빈 줄에 손으로 넣는 과목명. */
    public record SheetLine(String key, String label, BigDecimal amount) {}

    public record SheetResponse(Long id, StatementSheetKind kind, Integer termNo, String fromYm, String toYm,
                                LocalDate settleDate, boolean allItems, List<SheetLine> lines) {}

    /** [신규(F2)] · 기수 머리 고치기 */
    public record SaveSheetRequest(
            @NotNull StatementSheetKind kind,
            @NotNull @Min(1) Integer termNo,
            @NotNull @Pattern(regexp = "\\d{4}-\\d{2}") String fromYm,
            @NotNull @Pattern(regexp = "\\d{4}-\\d{2}") String toYm,
            LocalDate settleDate,
            Boolean allItems) {}

    /** [입력] 창 [저장(F8)] */
    public record SaveLinesRequest(@NotNull List<SheetLine> lines, LocalDate settleDate) {}
}
