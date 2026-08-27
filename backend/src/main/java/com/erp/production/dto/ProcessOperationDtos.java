package com.erp.production.dto;

import com.erp.production.domain.ProcessOperation;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

/** 작업코드등록 DTO. 원본 공정등록의 [작업코드등록] 이다. */
public final class ProcessOperationDtos {

    private ProcessOperationDtos() {}

    public record SaveOperationRequest(
            @NotNull(message = "공정을 선택하세요.") Long processId,
            @NotBlank(message = "작업코드를 입력하세요.") String code,
            @NotBlank(message = "작업명을 입력하세요.") String name,
            Integer seq,
            Boolean active
    ) {}

    public record OperationResponse(
            Long id,
            Long processId, String processCode, String processName,
            String code, String name, Integer seq, boolean active
    ) {
        public static OperationResponse from(ProcessOperation o) {
            return new OperationResponse(
                    o.getId(),
                    o.getProcess().getId(), o.getProcess().getCode(), o.getProcess().getName(),
                    o.getCode(), o.getName(), o.getSeq(), o.isActive());
        }
    }
}
