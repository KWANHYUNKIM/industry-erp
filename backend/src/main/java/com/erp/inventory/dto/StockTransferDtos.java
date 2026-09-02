package com.erp.inventory.dto;

import com.erp.inventory.domain.StockTransfer;
import jakarta.validation.constraints.Size;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;

import java.math.BigDecimal;
import java.time.LocalDate;

public final class StockTransferDtos {

    private StockTransferDtos() {}

    public record CreateTransferRequest(
            @NotNull(message = "품목을 선택하세요.") Long itemId,
            @NotNull(message = "출고창고를 선택하세요.") Long fromWarehouseId,
            @NotNull(message = "입고창고를 선택하세요.") Long toWarehouseId,
            @NotNull(message = "이동수량을 입력하세요.") @Positive(message = "이동수량은 0보다 커야 합니다.") BigDecimal quantity,
            LocalDate transferDate,
            /* 원본 조건의 [프로젝트]·[담당자]. 옮길 때 안 정했을 수 있어 필수가 아니다. */
            Long projectId,
            Long employeeId,
            @Size(max = 300, message = "입력한 글자가 너무 깁니다. 300자까지 넣을 수 있습니다.")
            String reason
    ) {}

    public record TransferResponse(
            Long id, String transferNo, LocalDate transferDate,
            Long itemId, String itemCode, String itemName, String unit,
            Long fromWarehouseId, String fromWarehouseName,
            Long toWarehouseId, String toWarehouseName,
            BigDecimal quantity,
            Long projectId, String projectName, Long employeeId,
            String reason, String createdBy
    ) {
        public static TransferResponse from(StockTransfer t) {
            return new TransferResponse(
                    t.getId(), t.getTransferNo(), t.getTransferDate(),
                    t.getItem().getId(), t.getItem().getCode(), t.getItem().getName(), t.getItem().getUnit(),
                    t.getFromWarehouse().getId(), t.getFromWarehouse().getName(),
                    t.getToWarehouse().getId(), t.getToWarehouse().getName(),
                    t.getQuantity(),
                    t.getProject() != null ? t.getProject().getId() : null,
                    t.getProject() != null ? t.getProject().getName() : null,
                    t.getEmployeeId(),
                    t.getReason(), t.getCreatedBy());
        }
    }
}
