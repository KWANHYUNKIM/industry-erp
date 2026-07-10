package com.erp.dto;

import com.erp.domain.SupplyItem;
import jakarta.validation.constraints.NotBlank;

import java.math.BigDecimal;

public final class SupplyDtos {

    private SupplyDtos() {}

    public record CreateSupplyRequest(
            @NotBlank(message = "품목코드를 입력하세요.") String code,
            @NotBlank(message = "공용품명을 입력하세요.") String name,
            String category,
            String unit,
            BigDecimal stockQty,
            String note
    ) {}

    /** null 필드는 변경하지 않음. */
    public record UpdateSupplyRequest(
            String name,
            String category,
            String unit,
            BigDecimal stockQty,
            String note
    ) {}

    public record SupplyResponse(
            Long id,
            String code,
            String name,
            String category,
            String unit,
            BigDecimal stockQty,
            String note
    ) {
        public static SupplyResponse from(SupplyItem s) {
            return new SupplyResponse(s.getId(), s.getCode(), s.getName(), s.getCategory(),
                    s.getUnit(), s.getStockQty(), s.getNote());
        }
    }
}
