package com.erp.trade.dto;

import com.erp.trade.domain.MallItemMapping;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

public final class MallItemMappingDtos {

    private MallItemMappingDtos() {}

    public record CreateMappingRequest(
            @NotBlank(message = "쇼핑몰을 입력하세요.") String mall,
            @NotBlank(message = "쇼핑몰 품목코드를 입력하세요.") String mallProductCode,
            String mallProductName,
            @NotNull(message = "연결할 품목을 선택하세요.") Long itemId
    ) {}

    public record UpdateMappingRequest(
            String mallProductName,
            @NotNull(message = "연결할 품목을 선택하세요.") Long itemId,
            Boolean active
    ) {}

    public record MappingResponse(
            Long id, String mall, String mallProductCode, String mallProductName,
            Long itemId, String itemCode, String itemName, boolean active
    ) {
        public static MappingResponse from(MallItemMapping m) {
            return new MappingResponse(
                    m.getId(), m.getMall(), m.getMallProductCode(), m.getMallProductName(),
                    m.getItem().getId(), m.getItem().getCode(), m.getItem().getName(), m.isActive());
        }
    }
}
