package com.erp.dto;

import com.erp.domain.ProductionResource;
import jakarta.validation.constraints.NotBlank;

import java.math.BigDecimal;

public final class ResourceDtos {

    private ResourceDtos() {}

    public record CreateResourceRequest(
            @NotBlank(message = "자원코드를 입력하세요.") String code,
            @NotBlank(message = "자원명을 입력하세요.") String name,
            String type,
            BigDecimal capacity,
            String unit,
            BigDecimal costPerHr
    ) {}

    public record UpdateResourceRequest(
            @NotBlank(message = "자원명을 입력하세요.") String name,
            String type,
            BigDecimal capacity,
            String unit,
            BigDecimal costPerHr,
            Boolean active
    ) {}

    public record ResourceResponse(
            Long id,
            String code,
            String name,
            String type,
            BigDecimal capacity,
            String unit,
            BigDecimal costPerHr,
            boolean active
    ) {
        public static ResourceResponse from(ProductionResource r) {
            return new ResourceResponse(r.getId(), r.getCode(), r.getName(), r.getType(),
                    r.getCapacity(), r.getUnit(), r.getCostPerHr(), r.isActive());
        }
    }
}
