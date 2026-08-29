package com.erp.accounting.dto;

import com.erp.accounting.domain.ItemCost;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import java.math.BigDecimal;
import java.math.RoundingMode;

public final class CostDtos {

    private CostDtos() {}

    public record CreateCostRequest(
            @NotNull(message = "품목을 선택하세요.") Long itemId,
            @NotBlank(message = "적용기간을 입력하세요.") String period,
            @PositiveOrZero(message = "재료비는 0 이상이어야 합니다.") BigDecimal materialCost,
            @PositiveOrZero(message = "노무비는 0 이상이어야 합니다.") BigDecimal laborCost,
            @PositiveOrZero(message = "경비는 0 이상이어야 합니다.") BigDecimal overheadCost,
            @PositiveOrZero(message = "실제재료비는 0 이상이어야 합니다.") BigDecimal actualMaterial,
            @PositiveOrZero(message = "실제노무비는 0 이상이어야 합니다.") BigDecimal actualLabor,
            @PositiveOrZero(message = "실제경비는 0 이상이어야 합니다.") BigDecimal actualOverhead
    ) {}

    public record UpdateCostRequest(
            @PositiveOrZero(message = "재료비는 0 이상이어야 합니다.") BigDecimal materialCost,
            @PositiveOrZero(message = "노무비는 0 이상이어야 합니다.") BigDecimal laborCost,
            @PositiveOrZero(message = "경비는 0 이상이어야 합니다.") BigDecimal overheadCost,
            @PositiveOrZero(message = "실제재료비는 0 이상이어야 합니다.") BigDecimal actualMaterial,
            @PositiveOrZero(message = "실제노무비는 0 이상이어야 합니다.") BigDecimal actualLabor,
            @PositiveOrZero(message = "실제경비는 0 이상이어야 합니다.") BigDecimal actualOverhead
    ) {}

    public record CostResponse(
            Long id,
            Long itemId,
            String itemCode,
            String itemName,
            String period,
            BigDecimal materialCost,
            BigDecimal laborCost,
            BigDecimal overheadCost,
            BigDecimal standardTotal,
            BigDecimal actualMaterial,
            BigDecimal actualLabor,
            BigDecimal actualOverhead,
            BigDecimal actualTotal,
            BigDecimal variance,       // 실제 - 표준
            BigDecimal varianceRate    // 차이율(%) = 차이 / 표준 * 100
    ) {
        public static CostResponse from(ItemCost c) {
            BigDecimal std = c.standardTotal();
            BigDecimal variance = c.variance();
            BigDecimal rate = std.signum() == 0 ? BigDecimal.ZERO
                    : variance.multiply(BigDecimal.valueOf(100)).divide(std, 1, RoundingMode.HALF_UP);
            return new CostResponse(
                    c.getId(), c.getItem().getId(), c.getItem().getCode(), c.getItem().getName(),
                    c.getPeriod(),
                    c.getMaterialCost(), c.getLaborCost(), c.getOverheadCost(), std,
                    c.getActualMaterial(), c.getActualLabor(), c.getActualOverhead(), c.actualTotal(),
                    variance, rate);
        }
    }
}
