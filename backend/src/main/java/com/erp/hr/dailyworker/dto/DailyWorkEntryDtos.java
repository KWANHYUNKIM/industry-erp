package com.erp.hr.dailyworker.dto;

import com.erp.hr.dailyworker.DailyWorkEntry;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.PositiveOrZero;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

public class DailyWorkEntryDtos {

    public record EntryLine(
            @NotNull(message = "근무일자를 확인바랍니다.") LocalDate workDate,
            @NotNull(message = "사원을 선택 바랍니다.") Long workerId,
            @NotNull(message = "근무기록을 입력 바랍니다.") @Positive(message = "근무기록은 0보다 커야 합니다.") BigDecimal quantity,
            @PositiveOrZero(message = "금액은 0 이상이어야 합니다.") BigDecimal amount
    ) {}

    public record SaveSlipRequest(
            @NotNull(message = "일자를 입력 바랍니다.") LocalDate slipDate,
            @NotEmpty(message = "근무기록을 한 줄 이상 넣으세요.") List<@Valid EntryLine> lines
    ) {}

    /** 원본 수당항목 · 단위 열 — 일근무 · 변동(일) 고정. */
    public record LineResponse(
            Long id, int lineNo, LocalDate workDate, Long workerId, String workerCode, String workerName,
            String payItem, String unit, BigDecimal quantity, BigDecimal amount
    ) {
        public static LineResponse from(DailyWorkEntry e) {
            return new LineResponse(e.getId(), e.getLineNo(), e.getWorkDate(), e.getWorker().getId(),
                    e.getWorker().getCode(), e.getWorker().getName(), "일근무", "변동(일)", e.getQuantity(), e.getAmount());
        }
    }

    public record SlipResponse(LocalDate slipDate, int slipNo, List<LineResponse> lines) {}
}
