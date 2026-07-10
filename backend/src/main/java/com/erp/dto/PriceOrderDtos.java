package com.erp.dto;

import com.erp.domain.PriceOrderSetting;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import java.util.List;

public final class PriceOrderDtos {

    private PriceOrderDtos() {}

    public record PriceOrderLine(
            @NotBlank String functionName,
            int applyOrder,
            boolean active
    ) {
        public static PriceOrderLine from(PriceOrderSetting s) {
            return new PriceOrderLine(s.getFunctionName(), s.getApplyOrder(), s.isActive());
        }
    }

    public record SavePriceOrderRequest(
            @NotBlank(message = "구분(category)을 지정하세요.") String category,
            @NotNull List<PriceOrderLine> settings
    ) {}
}
