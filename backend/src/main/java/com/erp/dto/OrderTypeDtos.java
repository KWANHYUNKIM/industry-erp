package com.erp.dto;

import com.erp.domain.OrderType;
import jakarta.validation.constraints.NotBlank;

public final class OrderTypeDtos {

    private OrderTypeDtos() {}

    public record CreateOrderTypeRequest(
            @NotBlank(message = "유형코드를 입력하세요.") String code,
            @NotBlank(message = "유형명을 입력하세요.") String name,
            String description
    ) {}

    public record UpdateOrderTypeRequest(
            @NotBlank(message = "유형명을 입력하세요.") String name,
            String description,
            Boolean active
    ) {}

    public record OrderTypeResponse(
            Long id,
            String code,
            String name,
            String description,
            boolean active
    ) {
        public static OrderTypeResponse from(OrderType t) {
            return new OrderTypeResponse(t.getId(), t.getCode(), t.getName(), t.getDescription(), t.isActive());
        }
    }
}
