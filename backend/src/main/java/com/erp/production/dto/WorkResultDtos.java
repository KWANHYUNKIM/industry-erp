package com.erp.production.dto;

import com.erp.production.domain.WorkResult;
import jakarta.validation.constraints.NotBlank;

import java.math.BigDecimal;
import java.time.LocalDate;

public final class WorkResultDtos {

    private WorkResultDtos() {}

    public record CreateWorkResultRequest(
            Long workOrderId,
            @NotBlank(message = "공정을 입력하세요.") String process,
            /** 투입자원(설비) id. 원본 그리드의 [투입자원] 열. */
            Long resourceId,
            /** 생산공장 id. 원본 작업내역입력 머리의 [생산공장]. */
            Long warehouseId,
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
            /** 작업지시가 가리키는 생산품목. 지시 없이 적은 작업내역이면 null. */
            Long productId, String productCode, String productName,
            String process,
            /** 공정 마스터와 연결된 경우의 공정 id. 자유입력이면 null. */
            Long processId,
            /** 투입자원(설비). 안 정했으면 null. */
            Long resourceId, String resourceName,
            /** 생산공장. 안 정했으면 null. */
            Long warehouseId, String warehouseName,
            String worker,
            BigDecimal goodQty, BigDecimal defectQty, Integer workTimeMin,
            /**
             * BOR(작업소요시간)이 말하는 표준작업시간(분). 원본 작업내역현황의 열이다.
             * 그 품목·공정의 라우팅이 없으면 null — 0 과 구분해야 한다.
             */
            Integer standardTimeMin,
            LocalDate workDate, String note
    ) {
        public static WorkResultResponse from(WorkResult wr) {
            return from(wr, null);
        }

        public static WorkResultResponse from(WorkResult wr, Integer standardTimeMin) {
            var product = wr.getWorkOrder() != null ? wr.getWorkOrder().getProduct() : null;
            return new WorkResultResponse(
                    wr.getId(),
                    wr.getWorkOrder() != null ? wr.getWorkOrder().getId() : null,
                    wr.getWorkOrder() != null ? wr.getWorkOrder().getOrderNo() : null,
                    product != null ? product.getId() : null,
                    product != null ? product.getCode() : null,
                    product != null ? product.getName() : null,
                    wr.getProcess(),
                    wr.getProcessMaster() != null ? wr.getProcessMaster().getId() : null,
                    wr.getResource() != null ? wr.getResource().getId() : null,
                    wr.getResource() != null ? wr.getResource().getName() : null,
                    wr.getWarehouse() != null ? wr.getWarehouse().getId() : null,
                    wr.getWarehouse() != null ? wr.getWarehouse().getName() : null,
                    wr.getWorker(),
                    wr.getGoodQty(), wr.getDefectQty(), wr.getWorkTimeMin(),
                    standardTimeMin,
                    wr.getWorkDate(), wr.getNote());
        }
    }
}
