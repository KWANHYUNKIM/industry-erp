package com.erp.dto;

import com.erp.domain.ProductionProcess;
import jakarta.validation.constraints.NotBlank;

import java.math.BigDecimal;

public final class ProcessDtos {

    private ProcessDtos() {}

    public record CreateProcessRequest(
            @NotBlank(message = "공정코드를 입력하세요.") String code,
            @NotBlank(message = "공정명을 입력하세요.") String name,
            String workcenter,
            Integer stdTimeMin,
            BigDecimal costPerHr
    ) {}

    public record UpdateProcessRequest(
            @NotBlank(message = "공정명을 입력하세요.") String name,
            String workcenter,
            Integer stdTimeMin,
            BigDecimal costPerHr,
            Boolean active
    ) {}

    public record ProcessResponse(
            Long id,
            String code,
            String name,
            String workcenter,
            Integer stdTimeMin,
            BigDecimal costPerHr,
            boolean active
    ) {
        public static ProcessResponse from(ProductionProcess p) {
            return new ProcessResponse(p.getId(), p.getCode(), p.getName(), p.getWorkcenter(),
                    p.getStdTimeMin(), p.getCostPerHr(), p.isActive());
        }
    }
}
