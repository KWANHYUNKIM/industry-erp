package com.erp.trade.dto;

import com.erp.trade.domain.OrderStage;
import jakarta.validation.constraints.Size;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

public final class OrderStageDtos {

    private OrderStageDtos() {}

    public record CreateOrderStageRequest(
            @Size(max = 50, message = "단계코드는 50자까지 넣을 수 있습니다.")
            @NotBlank(message = "단계코드를 입력하세요.") String code,
            @Size(max = 100, message = "단계명은 100자까지 넣을 수 있습니다.")
            @NotBlank(message = "단계명을 입력하세요.") String name,
            @NotNull(message = "순서를 입력하세요.") Integer sortOrder
    ) {}

    public record UpdateOrderStageRequest(
            @Size(max = 100, message = "단계명은 100자까지 넣을 수 있습니다.")
            @NotBlank(message = "단계명을 입력하세요.") String name,
            @NotNull(message = "순서를 입력하세요.") Integer sortOrder,
            Boolean active
    ) {}

    public record OrderStageResponse(
            Long id,
            String code,
            String name,
            Integer sortOrder,
            boolean active
    ) {
        public static OrderStageResponse from(OrderStage s) {
            return new OrderStageResponse(s.getId(), s.getCode(), s.getName(), s.getSortOrder(), s.isActive());
        }
    }
}
