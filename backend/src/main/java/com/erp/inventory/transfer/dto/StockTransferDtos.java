package com.erp.inventory.transfer.dto;

import com.erp.inventory.transfer.StockTransfer;
import com.erp.inventory.item.ItemCategory;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Size;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

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

    /**
     * 창고이동 전표 한 장(원본 창고이동입력 E040501): 머리(일자 · 담당자 · 보내는창고 · 받는창고 · 프로젝트) + 줄(품목 · 수량 · 적요).
     * 등록 · 수정이 같은 모양을 쓴다 — 수정은 줄을 통째로 바꾼다.
     */
    public record TransferSlipRequest(
            LocalDate transferDate,
            @NotNull(message = "보내는창고를 선택하세요.") Long fromWarehouseId,
            @NotNull(message = "받는창고를 선택하세요.") Long toWarehouseId,
            Long projectId,
            Long employeeId,
            @NotEmpty(message = "품목을 한 줄 이상 입력하세요.") List<@Valid TransferLineRequest> lines
    ) {}

    public record TransferLineRequest(
            @NotNull(message = "품목을 선택하세요.") Long itemId,
            @NotNull(message = "수량을 입력하세요.") @Positive(message = "수량은 0보다 커야 합니다.") BigDecimal quantity,
            @Size(max = 300, message = "입력한 글자가 너무 깁니다. 300자까지 넣을 수 있습니다.")
            String reason
    ) {}

    public record TransferResponse(
            Long id, String transferNo, Integer lineNo, LocalDate transferDate,
            Long itemId, String itemCode, String itemName, String unit,
            /** 원본 격자 열이 [품목명(규격명)] 이다. 품목 마스터의 값이라 실어 주기만 한다. */
            String spec,
            /** 원본 조건 <b>[품목구분]</b>. 원재료를 옮기는 건지 상품을 옮기는 건지로 먼저 갈라 본다. */
            ItemCategory itemCategory, String itemCategoryName,
            Long fromWarehouseId, String fromWarehouseName,
            Long toWarehouseId, String toWarehouseName,
            BigDecimal quantity,
            Long projectId, String projectName, Long employeeId,
            String reason, String createdBy,
            /**
             * 원본 조건 [최초작성일자] · [최종작업일자], 그리고 [기타]의 <b>수정일자순(정렬)</b>.
             * StockTransfer 는 BaseTimeEntity 를 물려받아 두 칸을 진작 채우고 있었다.
             */
            LocalDateTime createdAt, LocalDateTime updatedAt
    ) {
        public static TransferResponse from(StockTransfer t) {
            return new TransferResponse(
                    t.getId(), t.getTransferNo(), t.getLineNo(), t.getTransferDate(),
                    t.getItem().getId(), t.getItem().getCode(), t.getItem().getName(), t.getItem().getUnit(),
                    t.getItem().getSpec(),
                    t.getItem().getCategory(),
                    t.getItem().getCategory() != null ? t.getItem().getCategory().getDisplayName() : null,
                    t.getFromWarehouse().getId(), t.getFromWarehouse().getName(),
                    t.getToWarehouse().getId(), t.getToWarehouse().getName(),
                    t.getQuantity(),
                    t.getProject() != null ? t.getProject().getId() : null,
                    t.getProject() != null ? t.getProject().getName() : null,
                    t.getEmployeeId(),
                    t.getReason(), t.getCreatedBy(),
                    t.getCreatedAt(), t.getUpdatedAt());
        }
    }
}
