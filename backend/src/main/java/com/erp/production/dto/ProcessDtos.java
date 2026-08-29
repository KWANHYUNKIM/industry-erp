package com.erp.production.dto;

import com.erp.production.domain.ProductionProcess;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.NotBlank;

import java.math.BigDecimal;

public final class ProcessDtos {

    private ProcessDtos() {}

    public record CreateProcessRequest(
            @NotBlank(message = "공정코드를 입력하세요.") String code,
            @NotBlank(message = "공정명을 입력하세요.") String name,
            String workcenter,
            @PositiveOrZero(message = "표준시간은 0 이상이어야 합니다.") Integer stdTimeMin,
            @PositiveOrZero(message = "시간당비용은 0 이상이어야 합니다.") BigDecimal costPerHr,
            /** 순번. 원본 공정등록의 [순번] 열. 안 주면 0. */
            Integer sortOrder
    ) {}

    public record UpdateProcessRequest(
            @NotBlank(message = "공정명을 입력하세요.") String name,
            String workcenter,
            @PositiveOrZero(message = "표준시간은 0 이상이어야 합니다.") Integer stdTimeMin,
            @PositiveOrZero(message = "시간당비용은 0 이상이어야 합니다.") BigDecimal costPerHr,
            Integer sortOrder,
            Boolean active
    ) {}

    public record ProcessResponse(
            Long id,
            String code,
            String name,
            String workcenter,
            Integer stdTimeMin,
            BigDecimal costPerHr,
            Integer sortOrder,
            boolean active
    ) {
        public static ProcessResponse from(ProductionProcess p) {
            return new ProcessResponse(p.getId(), p.getCode(), p.getName(), p.getWorkcenter(),
                    p.getStdTimeMin(), p.getCostPerHr(), p.getSortOrder(), p.isActive());
        }
    }
}
