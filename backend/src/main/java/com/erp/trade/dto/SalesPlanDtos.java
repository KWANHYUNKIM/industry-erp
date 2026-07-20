package com.erp.trade.dto;

import com.erp.trade.domain.SalesPlan;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;

import java.math.BigDecimal;

public final class SalesPlanDtos {

    private SalesPlanDtos() {}

    public record CreateSalesPlanRequest(
            @NotNull(message = "품목을 선택하세요.") Long itemId,
            @NotNull @Min(value = 2000, message = "연도를 확인하세요.") Integer planYear,
            @NotNull @Min(1) @Max(value = 12, message = "월은 1~12 입니다.") Integer planMonth,
            @NotNull @PositiveOrZero(message = "계획수량은 0 이상이어야 합니다.") BigDecimal planQty,
            @NotNull @PositiveOrZero(message = "계획금액은 0 이상이어야 합니다.") BigDecimal planAmount,
            String remark
    ) {}

    public record SalesPlanResponse(
            Long id, int planYear, int planMonth,
            Long itemId, String itemCode, String itemName, String unit,
            BigDecimal planQty, BigDecimal planAmount, String remark, String createdBy
    ) {
        public static SalesPlanResponse from(SalesPlan p) {
            return new SalesPlanResponse(
                    p.getId(), p.getPlanYear(), p.getPlanMonth(),
                    p.getItem().getId(), p.getItem().getCode(), p.getItem().getName(), p.getItem().getUnit(),
                    p.getPlanQty(), p.getPlanAmount(), p.getRemark(), p.getCreatedBy());
        }
    }

    /** 매출계획비교표 한 줄: 계획 vs 실적(판매 집계)과 달성률. id 는 계획행 삭제용. */
    public record ComparisonRow(
            Long id, int planYear, int planMonth,
            Long itemId, String itemName, String unit,
            BigDecimal planQty, BigDecimal planAmount,
            BigDecimal actualQty, BigDecimal actualAmount,
            BigDecimal achieveRate
    ) {}
}
