package com.erp.hr.workrecord.dto;

import com.erp.hr.workrecord.WorkRecord;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

public class WorkRecordDtos {

    public record LineInput(
            @NotNull(message = "근무일자를 확인바랍니다.") LocalDate workDate,
            @NotNull(message = "사원을 선택 바랍니다.") Long employeeId,
            @NotNull(message = "수당항목을 선택 바랍니다.") Long payItemId,
            @NotNull(message = "근무기록을 입력 바랍니다.") @Positive(message = "근무기록은 0보다 커야 합니다.") BigDecimal quantity
    ) {}

    /** 근무입력 저장 — 머리 [일자] + 줄들. */
    public record SaveSlipRequest(
            @NotNull(message = "일자를 입력 바랍니다.") LocalDate slipDate,
            @NotEmpty(message = "근무기록을 한 줄 이상 넣으세요.") List<@Valid LineInput> lines
    ) {}

    public record LineResponse(
            Long id, int lineNo, LocalDate workDate,
            Long employeeId, String employeeCode, String employeeName,
            Long payItemId, String payItemCode, String payItemName, String unit,
            BigDecimal quantity
    ) {
        public static LineResponse from(WorkRecord w) {
            return new LineResponse(w.getId(), w.getLineNo(), w.getWorkDate(),
                    w.getEmployee().getId(), w.getEmployee().getCode(), w.getEmployee().getName(),
                    w.getPayItem().getId(), w.getPayItem().getCode(), w.getPayItem().getName(),
                    w.getPayItem().getPayMethod().getDisplayName(), w.getQuantity());
        }
    }

    /** 근무기록확정 한 칸 — 사원 · 수당항목 · 확정 근무기록. */
    public record ConfirmCell(
            @NotNull(message = "사원을 선택 바랍니다.") Long employeeId,
            @NotNull(message = "수당항목을 선택 바랍니다.") Long payItemId,
            @NotNull(message = "근무기록을 입력 바랍니다.") BigDecimal quantity
    ) {}

    /** 근무기록확정 · 근무확정현황 한 줄. */
    public record ConfirmRow(
            String payMonth, Long employeeId, String employeeCode, String employeeName,
            Long payItemId, String payItemName, String unit, BigDecimal quantity
    ) {}

    /** 근무조회 한 줄 = 전표 한 장. 사원 · 수당항목은 첫 줄 것, 여러 줄이면 '외 n건'. */
    public record SlipResponse(
            LocalDate slipDate, int slipNo, String employeeLabel, String payItemLabel,
            BigDecimal quantity, List<LineResponse> lines
    ) {}

    /** 근무조회 [이력] 한 줄 · H 창 한 줄 — 작업일시 · 전표번호 · 행위 · 사원명 · 수당항목 · 근무기록 · 작업자. */
    public record HistoryRow(
            Long id, java.time.LocalDateTime actedAt, LocalDate slipDate, int slipNo, String action,
            String employeeName, String payItemName, BigDecimal quantity, String worker,
            /** 그때의 줄 — 이 기능 전에 남은 이력은 빈 목록 */
            List<HistoryLine> lines
    ) {
        private static final com.fasterxml.jackson.databind.ObjectMapper JSON =
                new com.fasterxml.jackson.databind.ObjectMapper().findAndRegisterModules();

        public static HistoryRow from(com.erp.hr.workrecord.WorkRecordHistory h) {
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

    /** 이력에 남긴 그때의 줄 한 줄 — 원본 이력 [전표번호] 창: 근무일자 · 사원 · 수당항목 · 단위 · 근무기록. */
    public record HistoryLine(
            LocalDate workDate, Long employeeId, String employeeCode, String employeeName,
            Long departmentId, String departmentName,
            Long payItemId, String payItemName, String unit, BigDecimal quantity
    ) {
        public static HistoryLine from(com.erp.hr.workrecord.WorkRecord w) {
            var e = w.getEmployee();
            var d = e.getDepartment();
            return new HistoryLine(w.getWorkDate(), e.getId(), e.getCode(), e.getName(),
                    d == null ? null : d.getId(), d == null ? null : d.getName(),
                    w.getPayItem().getId(), w.getPayItem().getName(), w.getPayItem().getPayMethod().getDisplayName(), w.getQuantity());
        }
    }
}
