package com.erp.inventory.dto;

import com.erp.inventory.domain.StockAdjustment;
import com.erp.inventory.domain.enums.StockAdjustmentType;
import jakarta.validation.constraints.Size;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;

import java.math.BigDecimal;
import java.time.LocalDate;

public final class StockAdjustmentDtos {

    private StockAdjustmentDtos() {}

    /**
     * 자가사용·불량처리는 quantity(차감할 수량)를, 재고조정은 actualQty(실사수량)를 채운다.
     * 재고조정의 변동량은 실사수량 - 현재고로 서버가 계산한다.
     */
    public record CreateAdjustmentRequest(
            @NotNull(message = "유형을 선택하세요.") StockAdjustmentType type,
            @NotNull(message = "품목을 선택하세요.") Long itemId,
            @NotNull(message = "창고를 선택하세요.") Long warehouseId,
            @PositiveOrZero(message = "수량은 0보다 작을 수 없습니다.") BigDecimal quantity,
            @PositiveOrZero(message = "실사수량은 0보다 작을 수 없습니다.") BigDecimal actualQty,
            LocalDate adjustDate,
            /* 원본 조건의 [프로젝트]·[담당자]. 맞출 때 안 정했을 수 있어 필수가 아니다. */
            Long projectId,
            Long employeeId,
            @Size(max = 300, message = "입력한 글자가 너무 깁니다. 300자까지 넣을 수 있습니다.")
            String reason
    ) {}

    public record AdjustmentResponse(
            Long id, String adjustNo, LocalDate adjustDate,
            StockAdjustmentType type, String typeName,
            Long itemId, String itemCode, String itemName, String unit,
            Long warehouseId, String warehouseName,
            BigDecimal beforeQty, BigDecimal quantityChange, BigDecimal afterQty,
            Long projectId, String projectName, Long employeeId,
            String reason, String createdBy
    ) {
        public static AdjustmentResponse from(StockAdjustment a) {
            return new AdjustmentResponse(
                    a.getId(), a.getAdjustNo(), a.getAdjustDate(),
                    a.getType(), a.getType().getDisplayName(),
                    a.getItem().getId(), a.getItem().getCode(), a.getItem().getName(), a.getItem().getUnit(),
                    a.getWarehouse().getId(), a.getWarehouse().getName(),
                    a.getBeforeQty(), a.getQuantityChange(), a.getAfterQty(),
                    a.getProject() != null ? a.getProject().getId() : null,
                    a.getProject() != null ? a.getProject().getName() : null,
                    a.getEmployeeId(),
                    a.getReason(), a.getCreatedBy());
        }
    }
}
