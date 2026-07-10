package com.erp.dto;

import com.erp.domain.WorkResult;
import jakarta.validation.constraints.NotBlank;

import java.math.BigDecimal;
import java.time.LocalDate;

public final class WorkResultDtos {

    private WorkResultDtos() {}

    public record CreateWorkResultRequest(
            Long workOrderId,
            @NotBlank(message = "공정을 입력하세요.") String process,
            String worker,
            BigDecimal goodQty,
            BigDecimal defectQty,
            Integer workTimeMin,
            LocalDate workDate,
            String note
    ) {}

    public record WorkResultResponse(
            Long id,
            Long workOrderId, String workOrderNo,
            String process,
            /** 공정 마스터와 연결된 경우의 공정 id. 자유입력이면 null. */
            Long processId,
            String worker,
            BigDecimal goodQty, BigDecimal defectQty, Integer workTimeMin,
            LocalDate workDate, String note
    ) {
        public static WorkResultResponse from(WorkResult wr) {
            return new WorkResultResponse(
                    wr.getId(),
                    wr.getWorkOrder() != null ? wr.getWorkOrder().getId() : null,
                    wr.getWorkOrder() != null ? wr.getWorkOrder().getOrderNo() : null,
                    wr.getProcess(),
                    wr.getProcessMaster() != null ? wr.getProcessMaster().getId() : null,
                    wr.getWorker(),
                    wr.getGoodQty(), wr.getDefectQty(), wr.getWorkTimeMin(),
                    wr.getWorkDate(), wr.getNote());
        }
    }
}
