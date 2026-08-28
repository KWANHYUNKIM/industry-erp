package com.erp.production.dto;

import com.erp.production.domain.WorkResult;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotBlank;

import java.math.BigDecimal;
import java.util.List;
import java.time.LocalDate;

public final class WorkResultDtos {

    private WorkResultDtos() {}

    /**
     * 한 번에 <b>작업내역 여러 줄</b>. 원본 작업내역입력이 격자인 이유다 —
     * 같은 날 같은 공장에서 세 공정을 적으면서 머리(일자·생산공장·프로젝트)를
     * 세 번 다시 고를 일이 아니다.
     *
     * <p>한 줄이라도 막히면 <b>전부 되돌린다.</b> 두 줄만 들어가면 작업시간 합계가
     * 조용히 모자란 채로 남고, 효율현황이 그 값으로 계산된다.
     */
    public record CreateWorkResultBatchRequest(
            LocalDate workDate,
            Long warehouseId,
            Long projectId,
            @NotEmpty(message = "작업내역을 한 줄 이상 넣으세요.")
            List<@Valid WorkResultLine> lines
    ) {}

    /** 격자 한 줄. */
    public record WorkResultLine(
            Long workOrderId,
            @NotBlank(message = "공정을 입력하세요.") String process,
            Long workItemId,
            Long resourceId,
            String worker,
            BigDecimal goodQty,
            BigDecimal defectQty,
            Integer workTimeMin,
            String note
    ) {}

    public record CreateWorkResultRequest(
            Long workOrderId,
            @NotBlank(message = "공정을 입력하세요.") String process,
            /**
             * 원본 그리드의 [작업품목] id — 이 작업이 다루는 품목. 생산품목과 다르다.
             * 안 정할 수 있다.
             */
            Long workItemId,
            /** 투입자원(설비) id. 원본 그리드의 [투입자원] 열. */
            Long resourceId,
            /** 생산공장 id. 원본 작업내역입력 머리의 [생산공장]. */
            Long warehouseId,
            String worker,
            BigDecimal goodQty,
            BigDecimal defectQty,
            Integer workTimeMin,
            LocalDate workDate,
            /** 귀속 프로젝트. 원본 작업내역입력 머리의 [프로젝트]. 안 정할 수 있다. */
            Long projectId,
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
            /**
             * 원본 [작업품목] — 이 작업이 다루는 품목. 생산품목과 다르다.
             * 조회 화면은 '작업품목명[규격명]' 으로 적는다.
             */
            Long workItemId, String workItemCode, String workItemName, String workItemSpec,
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
            /** 귀속 프로젝트. 원본 머리의 [프로젝트]. */
            Long projectId, String projectName,
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
                    wr.getWorkItem() != null ? wr.getWorkItem().getId() : null,
                    wr.getWorkItem() != null ? wr.getWorkItem().getCode() : null,
                    wr.getWorkItem() != null ? wr.getWorkItem().getName() : null,
                    wr.getWorkItem() != null ? wr.getWorkItem().getSpec() : null,
                    wr.getResource() != null ? wr.getResource().getId() : null,
                    wr.getResource() != null ? wr.getResource().getName() : null,
                    wr.getWarehouse() != null ? wr.getWarehouse().getId() : null,
                    wr.getWarehouse() != null ? wr.getWarehouse().getName() : null,
                    wr.getWorker(),
                    wr.getGoodQty(), wr.getDefectQty(), wr.getWorkTimeMin(),
                    standardTimeMin,
                    wr.getProject() != null ? wr.getProject().getId() : null,
                    wr.getProject() != null ? wr.getProject().getName() : null,
                    wr.getWorkDate(), wr.getNote());
        }
    }
}
