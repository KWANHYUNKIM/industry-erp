package com.erp.inventory.adjustment.dto;

import com.erp.inventory.adjustment.StagedStockAdjustment;
import com.erp.inventory.adjustment.StagedStatus;
import jakarta.validation.constraints.Size;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;

import java.math.BigDecimal;
import java.time.LocalDate;
import com.erp.inventory.item.ItemCategory;

public final class StagedAdjustmentDtos {

    private StagedAdjustmentDtos() {}

    /**
     * 원본 재고조정진행단계 [재고조정] 창(단계별재고조정) — 기준일자 · 창고 · 적요 ·
     * [실수량을 변경하지 않은 품목의 수량 0으로 조정](2026-10-13 실측).
     * 창고를 비우면 모든 창고다.
     */
    public record BulkAdjustRequest(
            @NotNull(message = "기준일자를 입력하세요.") LocalDate date,
            java.util.List<Long> warehouseIds,
            @Size(max = 300, message = "입력한 글자가 너무 깁니다. 300자까지 넣을 수 있습니다.") String reason,
            boolean zeroUncounted
    ) {}

    /** 만든 재고조정 줄 수. */
    public record BulkAdjustResult(int adjusted) {}

    public record CreateStagedRequest(
            @NotNull(message = "품목을 선택하세요.") Long itemId,
            @NotNull(message = "창고를 선택하세요.") Long warehouseId,
            @NotNull(message = "실사수량을 입력하세요.") @PositiveOrZero(message = "실사수량은 0 이상이어야 합니다.") BigDecimal actualQty,
            LocalDate requestDate,
            @Size(max = 300, message = "입력한 글자가 너무 깁니다. 300자까지 넣을 수 있습니다.")
            String reason
    ) {}

    public record StagedResponse(
            Long id, String adjustNo, LocalDate requestDate,
            Long itemId, String itemCode, String itemName, String unit,
            /**
             * 원본 재고실사현황(E040615) 조건의 <b>[품목구분]</b>. 품목 마스터의 값이라
             * 실어 주기만 하면 된다 — 2026-09-08 실측으로 이 화면이 그 축을 못 거르고
             * 있었다는 것이 드러났다.
             */
            ItemCategory itemCategory, String itemCategoryName,
            Long warehouseId, String warehouseName,
            BigDecimal bookQty, BigDecimal actualQty, BigDecimal diff,
            String reason, StagedStatus status, String statusName,
            String requester, String handler
    ) {
        public static StagedResponse from(StagedStockAdjustment s) {
            BigDecimal diff = s.getActualQty().subtract(s.getBookQty());
            return new StagedResponse(
                    s.getId(), s.getAdjustNo(), s.getRequestDate(),
                    s.getItem().getId(), s.getItem().getCode(), s.getItem().getName(), s.getItem().getUnit(),
                    s.getItem().getCategory(),
                    s.getItem().getCategory() != null ? s.getItem().getCategory().getDisplayName() : null,
                    s.getWarehouse().getId(), s.getWarehouse().getName(),
                    s.getBookQty(), s.getActualQty(), diff,
                    s.getReason(), s.getStatus(), s.getStatus().getDisplayName(),
                    s.getRequester(), s.getHandler());
        }
    }
}
