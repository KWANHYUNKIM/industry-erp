package com.erp.inventory.dto;

import com.erp.inventory.domain.Item;
import com.erp.inventory.domain.ItemCategory;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;

import java.math.BigDecimal;

public final class ItemDtos {

    private ItemDtos() {}

    public record CreateItemRequest(
            @NotBlank(message = "품목코드를 입력하세요.") String code,
            @NotBlank(message = "품명을 입력하세요.") String name,
            String spec,
            @NotBlank(message = "단위를 입력하세요.") String unit,
            @NotNull(message = "품목분류를 선택하세요.") ItemCategory category,
            @NotNull @PositiveOrZero(message = "단가는 0 이상이어야 합니다.") BigDecimal unitPrice,
            @NotNull @PositiveOrZero(message = "안전재고는 0 이상이어야 합니다.") BigDecimal safetyStock,
            String barcode
    ) {}

    public record UpdateItemRequest(
            @NotBlank(message = "품명을 입력하세요.") String name,
            String spec,
            @NotBlank(message = "단위를 입력하세요.") String unit,
            @NotNull(message = "품목분류를 선택하세요.") ItemCategory category,
            @NotNull @PositiveOrZero BigDecimal unitPrice,
            @NotNull @PositiveOrZero BigDecimal safetyStock,
            String barcode,
            Boolean active
    ) {}

    public record ItemResponse(
            Long id,
            String code,
            String name,
            String spec,
            String unit,
            ItemCategory category,
            String categoryName,
            BigDecimal unitPrice,
            BigDecimal safetyStock,
            String barcode,
            boolean active
    ) {
        public static ItemResponse from(Item item) {
            return new ItemResponse(
                    item.getId(),
                    item.getCode(),
                    item.getName(),
                    item.getSpec(),
                    item.getUnit(),
                    item.getCategory(),
                    item.getCategory().getDisplayName(),
                    item.getUnitPrice(),
                    item.getSafetyStock(),
                    item.getBarcode(),
                    item.isActive()
            );
        }
    }
}
