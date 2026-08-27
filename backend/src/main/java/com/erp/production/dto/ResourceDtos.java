package com.erp.production.dto;

import com.erp.production.domain.ProductionResource;
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
            BigDecimal costPerHr,
            /** 위치(창고). 원본 자원등록의 [위치] 열. 비워 두면 자리를 안 정한 설비다. */
            Long warehouseId,
            /** 대상작업(공정). 원본 [대상작업] 열. */
            Long processId
    ) {}

    public record UpdateResourceRequest(
            @NotBlank(message = "자원명을 입력하세요.") String name,
            String type,
            BigDecimal capacity,
            String unit,
            BigDecimal costPerHr,
            /** 위치(창고). 원본 자원등록의 [위치] 열. 비워 두면 자리를 안 정한 설비다. */
            Long warehouseId,
            /** 대상작업(공정). 원본 [대상작업] 열. */
            Long processId,
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
            Long warehouseId, String warehouseName,
            Long processId, String processName,
            boolean active
    ) {
        public static ResourceResponse from(ProductionResource r) {
            return new ResourceResponse(r.getId(), r.getCode(), r.getName(), r.getType(),
                    r.getCapacity(), r.getUnit(), r.getCostPerHr(),
                    r.getWarehouse() != null ? r.getWarehouse().getId() : null,
                    r.getWarehouse() != null ? r.getWarehouse().getName() : null,
                    r.getProcess() != null ? r.getProcess().getId() : null,
                    r.getProcess() != null ? r.getProcess().getName() : null,
                    r.isActive());
        }
    }
}
