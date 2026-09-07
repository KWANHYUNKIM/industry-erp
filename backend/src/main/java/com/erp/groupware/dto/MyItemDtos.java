package com.erp.groupware.dto;

import com.erp.groupware.domain.MyItem;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;

import java.math.BigDecimal;

public final class MyItemDtos {

    private MyItemDtos() {}

    public record AddMyItemRequest(
            @NotNull(message = "품목을 선택하세요.") Long itemId,
            /** 담을 기본 수량 (선택, 기본 1) */
            @Positive(message = "기본 수량은 0보다 커야 합니다.") Integer defaultQty
    ) {}

    public record MyItemResponse(
            Long id, Long itemId, String itemCode, String itemName, String spec, String unit,
            BigDecimal unitPrice, Integer defaultQty, Integer sortOrder
    ) {
        public static MyItemResponse from(MyItem m) {
            return new MyItemResponse(
                    m.getId(), m.getItem().getId(), m.getItem().getCode(), m.getItem().getName(),
                    m.getItem().getSpec(), m.getItem().getUnit(), m.getItem().getUnitPrice(),
                    m.getDefaultQty(), m.getSortOrder());
        }
    }
}
