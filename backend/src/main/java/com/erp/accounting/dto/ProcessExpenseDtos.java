package com.erp.accounting.dto;

import com.erp.accounting.domain.ProcessExpense;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.PositiveOrZero;

import java.math.BigDecimal;

/** 노무비/경비등록 DTO. 원본 열: 공정명 · 창고코드 · 창고명 · 노무비 · 경비. */
public final class ProcessExpenseDtos {

    private ProcessExpenseDtos() {}

    public record SaveProcessExpenseRequest(
            @NotBlank(message = "기준년월을 입력하세요.")
            @Pattern(regexp = "\\d{4}-\\d{2}", message = "기준년월은 yyyy-MM 형식이어야 합니다.")
            String period,
            @NotNull(message = "공정을 선택하세요.") Long processId,
            /** 비우면 전사 공통이다. */
            Long warehouseId,
            @NotNull(message = "노무비를 입력하세요.")
            @PositiveOrZero(message = "노무비는 0 이상이어야 합니다.") BigDecimal laborCost,
            @NotNull(message = "경비를 입력하세요.")
            @PositiveOrZero(message = "경비는 0 이상이어야 합니다.") BigDecimal overheadCost,
            String remark
    ) {}

    public record ProcessExpenseResponse(
            Long id,
            String period,
            Long processId, String processCode, String processName,
            Long warehouseId, String warehouseCode, String warehouseName,
            BigDecimal laborCost,
            BigDecimal overheadCost,
            String remark
    ) {
        public static ProcessExpenseResponse from(ProcessExpense e) {
            return new ProcessExpenseResponse(
                    e.getId(), e.getPeriod(),
                    e.getProcess().getId(), e.getProcess().getCode(), e.getProcess().getName(),
                    e.getWarehouse() != null ? e.getWarehouse().getId() : null,
                    e.getWarehouse() != null ? e.getWarehouse().getCode() : null,
                    e.getWarehouse() != null ? e.getWarehouse().getName() : null,
                    e.getLaborCost(), e.getOverheadCost(), e.getRemark());
        }
    }
}
