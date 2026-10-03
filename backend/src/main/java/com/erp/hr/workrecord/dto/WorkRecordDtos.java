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

    /** 근무조회 한 줄 = 전표 한 장. 사원 · 수당항목은 첫 줄 것, 여러 줄이면 '외 n건'. */
    public record SlipResponse(
            LocalDate slipDate, int slipNo, String employeeLabel, String payItemLabel,
            BigDecimal quantity, List<LineResponse> lines
    ) {}
}
