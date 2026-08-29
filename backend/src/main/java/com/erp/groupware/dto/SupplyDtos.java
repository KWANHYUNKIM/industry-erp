package com.erp.groupware.dto;

import com.erp.groupware.domain.SupplyItem;
import jakarta.validation.constraints.Size;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.NotBlank;

import java.math.BigDecimal;

public final class SupplyDtos {

    private SupplyDtos() {}

    public record CreateSupplyRequest(
            @Size(max = 50, message = "품목코드는 50자까지 넣을 수 있습니다.")
            @NotBlank(message = "품목코드를 입력하세요.") String code,
            @Size(max = 100, message = "공용품명은 100자까지 넣을 수 있습니다.")
            @NotBlank(message = "공용품명을 입력하세요.") String name,
            @Size(max = 50, message = "입력한 글자가 너무 깁니다. 50자까지 넣을 수 있습니다.")
            String category,
            @Size(max = 20, message = "입력한 글자가 너무 깁니다. 20자까지 넣을 수 있습니다.")
            String unit,
            @PositiveOrZero(message = "재고수량은 0 이상이어야 합니다.") BigDecimal stockQty,
            @Size(max = 300, message = "입력한 글자가 너무 깁니다. 300자까지 넣을 수 있습니다.")
            String note
    ) {}

    /** null 필드는 변경하지 않음. */
    public record UpdateSupplyRequest(
            @Size(max = 100, message = "입력한 글자가 너무 깁니다. 100자까지 넣을 수 있습니다.")
            String name,
            @Size(max = 50, message = "입력한 글자가 너무 깁니다. 50자까지 넣을 수 있습니다.")
            String category,
            @Size(max = 20, message = "입력한 글자가 너무 깁니다. 20자까지 넣을 수 있습니다.")
            String unit,
            @PositiveOrZero(message = "재고수량은 0 이상이어야 합니다.") BigDecimal stockQty,
            @Size(max = 300, message = "입력한 글자가 너무 깁니다. 300자까지 넣을 수 있습니다.")
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
