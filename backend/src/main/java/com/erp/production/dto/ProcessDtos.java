package com.erp.production.dto;

import com.erp.production.domain.ProductionProcess;
import jakarta.validation.constraints.Size;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.NotBlank;

import java.math.BigDecimal;

public final class ProcessDtos {

    private ProcessDtos() {}

    public record CreateProcessRequest(
            @Size(max = 50, message = "공정코드는 50자까지 넣을 수 있습니다.")
            @NotBlank(message = "공정코드를 입력하세요.") String code,
            @Size(max = 100, message = "공정명은 100자까지 넣을 수 있습니다.")
            @NotBlank(message = "공정명을 입력하세요.") String name,
            @Size(max = 100, message = "입력한 글자가 너무 깁니다. 100자까지 넣을 수 있습니다.")
            String workcenter,
            @PositiveOrZero(message = "표준시간은 0 이상이어야 합니다.") Integer stdTimeMin,
            @PositiveOrZero(message = "시간당비용은 0 이상이어야 합니다.") BigDecimal costPerHr,
            /** 순번. 원본 공정등록의 [순번] 열. 안 주면 0. */
            Integer sortOrder
    ) {}

    public record UpdateProcessRequest(
            @Size(max = 100, message = "공정명은 100자까지 넣을 수 있습니다.")
            @NotBlank(message = "공정명을 입력하세요.") String name,
            @Size(max = 100, message = "입력한 글자가 너무 깁니다. 100자까지 넣을 수 있습니다.")
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
