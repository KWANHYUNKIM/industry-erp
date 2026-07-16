package com.erp.trade.dto;

import com.erp.trade.domain.OrderStage;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

public final class OrderStageDtos {

    private OrderStageDtos() {}

    public record CreateOrderStageRequest(
            @NotBlank(message = "단계코드를 입력하세요.") String code,
            @NotBlank(message = "단계명을 입력하세요.") String name,
            @NotNull(message = "순서를 입력하세요.") Integer sortOrder
    ) {}

    public record UpdateOrderStageRequest(
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
