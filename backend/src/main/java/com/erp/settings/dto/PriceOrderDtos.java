package com.erp.settings.dto;

import com.erp.settings.domain.PriceOrderSetting;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import java.util.List;

public final class PriceOrderDtos {

    private PriceOrderDtos() {}

    public record PriceOrderLine(
            @NotBlank(message = "기능명을 입력하세요.") String functionName,
            int applyOrder,
            boolean active
    ) {
        public static PriceOrderLine from(PriceOrderSetting s) {
            return new PriceOrderLine(s.getFunctionName(), s.getApplyOrder(), s.isActive());
        }
    }

    public record SavePriceOrderRequest(
            @NotBlank(message = "구분(category)을 지정하세요.") String category,
            @NotNull(message = "단가 순서를 넣으세요.")
            /** 원소마다 {@code @Valid} — 없으면 리스트 안쪽 제약이 통째로 무시된다. */
            List<@jakarta.validation.Valid PriceOrderLine> settings
    ) {}
}
