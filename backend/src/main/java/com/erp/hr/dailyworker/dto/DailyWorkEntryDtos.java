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
            @PositiveOrZero(message = "금액은 0 이상이어야 합니다.") BigDecimal amount,
            Long payItemId
    ) {}

    public record SaveSlipRequest(
            @NotNull(message = "일자를 입력 바랍니다.") LocalDate slipDate,
            @NotEmpty(message = "근무기록을 한 줄 이상 넣으세요.") List<@Valid EntryLine> lines
    ) {}

    /** 원본 수당항목 · 단위 열 — 수당항목이 비면 기본 일근무 · 변동(일). payItemId 는 null(일근무)일 수 있다. */
    public record LineResponse(
            Long id, LocalDate slipDate, int slipNo, int lineNo, LocalDate workDate, Long workerId, String workerCode, String workerName,
            Long payItemId, String payItem, String unit, BigDecimal quantity, BigDecimal amount
    ) {
        public static LineResponse from(DailyWorkEntry e) {
            var i = e.getPayItem();
            return new LineResponse(e.getId(), e.getSlipDate(), e.getSlipNo(), e.getLineNo(), e.getWorkDate(), e.getWorker().getId(),
                    e.getWorker().getCode(), e.getWorker().getName(), i != null ? i.getId() : null, i != null ? i.getName() : "일근무",
                    i != null && i.getPayMethod() != null ? i.getPayMethod() : "변동(일)", e.getQuantity(), e.getAmount());
        }
    }

    public record SlipResponse(LocalDate slipDate, int slipNo, List<LineResponse> lines) {}

    /** 근무조회 [이력] 한 줄 · H 창 한 줄 — 작업일시 · 전표번호 · 행위 · 사원명 · 수당항목 · 근무기록 · 작업자 + 그때의 줄. */
    public record HistoryRow(
            Long id, java.time.LocalDateTime actedAt, LocalDate slipDate, int slipNo, String action,
            String employeeName, String payItemName, BigDecimal quantity, String worker, List<HistoryLine> lines
    ) {
        private static final com.fasterxml.jackson.databind.ObjectMapper JSON =
                new com.fasterxml.jackson.databind.ObjectMapper().findAndRegisterModules();

        public static HistoryRow from(com.erp.hr.dailyworker.DailyWorkEntryHistory h) {
            return new HistoryRow(h.getId(), h.getActedAt(), h.getSlipDate(), h.getSlipNo(), h.getAction(),
                    h.getEmployeeName(), h.getPayItemName(), h.getQuantity(), h.getWorker(), readLines(h.getLinesJson()));
        }

        public static String writeLines(List<HistoryLine> lines) {
            try {
                return JSON.writeValueAsString(lines);
            } catch (com.fasterxml.jackson.core.JsonProcessingException e) {
                throw new IllegalStateException(e);
            }
        }

        private static List<HistoryLine> readLines(String json) {
            if (json == null || json.isBlank()) return List.of();
            try {
                return JSON.readValue(json, new com.fasterxml.jackson.core.type.TypeReference<List<HistoryLine>>() {});
            } catch (com.fasterxml.jackson.core.JsonProcessingException e) {
                return List.of();
            }
        }
    }

    /** 이력에 남긴 그때의 줄 — 근무일자 · 사원 · 수당항목 · 단위 · 근무기록. */
    public record HistoryLine(LocalDate workDate, Long workerId, String workerCode, String workerName,
                              String payItemName, String unit, BigDecimal quantity) {
        public static HistoryLine from(LineResponse l) {
            return new HistoryLine(l.workDate(), l.workerId(), l.workerCode(), l.workerName(), l.payItem(), l.unit(), l.quantity());
        }
    }
}
