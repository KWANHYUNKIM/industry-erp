package com.erp.inventory.dto;

import com.erp.inventory.domain.Warehouse;
import jakarta.validation.constraints.NotBlank;

public final class WarehouseDtos {

    private WarehouseDtos() {}

    public record CreateWarehouseRequest(
            @NotBlank(message = "창고코드를 입력하세요.") String code,
            @NotBlank(message = "창고명을 입력하세요.") String name,
            String location
    ) {}

    public record UpdateWarehouseRequest(
            @NotBlank(message = "창고명을 입력하세요.") String name,
            String location,
            Boolean active
    ) {}

    public record WarehouseResponse(
            Long id,
            String code,
            String name,
            String location,
            boolean active
    ) {
        public static WarehouseResponse from(Warehouse w) {
            return new WarehouseResponse(w.getId(), w.getCode(), w.getName(), w.getLocation(), w.isActive());
        }
    }
}
