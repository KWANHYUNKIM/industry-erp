package com.erp.trade.dto;

import com.erp.trade.domain.MallItemMapping;
import jakarta.validation.constraints.Size;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

public final class MallItemMappingDtos {

    private MallItemMappingDtos() {}

    public record CreateMappingRequest(
            @Size(max = 50, message = "쇼핑몰은 50자까지 넣을 수 있습니다.")
            @NotBlank(message = "쇼핑몰을 입력하세요.") String mall,
            @Size(max = 100, message = "쇼핑몰 품목코드는 100자까지 넣을 수 있습니다.")
            @NotBlank(message = "쇼핑몰 품목코드를 입력하세요.") String mallProductCode,
            @Size(max = 200, message = "입력한 글자가 너무 깁니다. 200자까지 넣을 수 있습니다.")
            String mallProductName,
            @NotNull(message = "연결할 품목을 선택하세요.") Long itemId
    ) {}

    public record UpdateMappingRequest(
            @Size(max = 200, message = "입력한 글자가 너무 깁니다. 200자까지 넣을 수 있습니다.")
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
