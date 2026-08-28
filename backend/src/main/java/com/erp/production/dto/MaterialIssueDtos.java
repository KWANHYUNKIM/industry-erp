package com.erp.production.dto;

import com.erp.production.domain.MaterialIssue;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

public final class MaterialIssueDtos {

    private MaterialIssueDtos() {}

    public record CreateMaterialIssueRequest(
            @NotNull(message = "자재(품목)를 선택하세요.") Long itemId,
            /** 보내는창고 */
            Long warehouseId,
            /** 받는공장. 원본은 이 둘 사이를 옮기는 전표다. */
            Long toWarehouseId,
            Long workOrderId,
            @NotNull(message = "불출수량을 입력하세요.") @Positive(message = "불출수량은 0보다 커야 합니다.") BigDecimal qty,
            LocalDate issueDate,
            /** 담당자(사원) id. 원본 생산불출입력 머리의 [담당자]. */
            Long employeeId,
            /** 귀속 프로젝트. 원본 생산불출입력 머리의 [프로젝트]. 안 정할 수 있다. */
            Long projectId,
            String note
    ) {}

    /**
     * 한 전표에 <b>자재 여러 줄</b>을 넣는다. 원본 생산불출입력이 격자인 이유다 —
     * 같은 날 같은 작업지시에 자재 다섯 개를 내보내면서 다섯 번 저장할 일이 아니다.
     *
     * <p>머리(일자·담당자·창고·작업지시·프로젝트)는 한 번만 주고 줄마다 품목·수량·적요를 준다.
     * 한 줄이라도 막히면(재고 부족 등) <b>전부 되돌린다</b> — 반쪽 전표가 남는 것이 더 나쁘다.
     */
    public record CreateMaterialIssueBatchRequest(
            Long warehouseId,
            Long toWarehouseId,
            Long workOrderId,
            LocalDate issueDate,
            Long employeeId,
            Long projectId,
            @NotEmpty(message = "자재를 한 줄 이상 넣으세요.")
            List<@Valid IssueLine> lines
    ) {}

    /** 격자 한 줄. */
    public record IssueLine(
            @NotNull(message = "자재(품목)를 선택하세요.") Long itemId,
            @NotNull(message = "불출수량을 입력하세요.")
            @Positive(message = "불출수량은 0보다 커야 합니다.") BigDecimal qty,
            String note
    ) {}

    public record MaterialIssueResponse(
            Long id,
            Long itemId, String itemCode, String itemName, String unit,
            /** 규격. 원본 생산불출조회의 열 이름이 [품목명[규격명]] 이다. */
            String itemSpec,
            Long warehouseId, String warehouseName,
            /** 받는공장 */
            Long toWarehouseId, String toWarehouseName,
            Long workOrderId, String workOrderNo,
            /**
             * 작업지시가 가리키는 <b>생산품목</b>. 원본 생산불출입력 머리의 [생산품목] 이고
             * 그리드의 [작업지시품목코드] 이기도 하다. 작업지시 없이 낸 불출이면 null.
             */
            String productCode, String productName,
            /** 담당자(사원) id. 이름은 화면이 붙인다 — production 은 hr 을 참조할 수 없다. */
            Long employeeId,
            /** 귀속 프로젝트. 원본 머리의 [프로젝트]. */
            Long projectId, String projectName,
            BigDecimal qty, LocalDate issueDate, String note
    ) {
        public static MaterialIssueResponse from(MaterialIssue mi) {
            return new MaterialIssueResponse(
                    mi.getId(),
                    mi.getItem().getId(), mi.getItem().getCode(), mi.getItem().getName(), mi.getItem().getUnit(),
                    mi.getItem().getSpec(),
                    mi.getWarehouse() != null ? mi.getWarehouse().getId() : null,
                    mi.getWarehouse() != null ? mi.getWarehouse().getName() : null,
                    mi.getToWarehouse() != null ? mi.getToWarehouse().getId() : null,
                    mi.getToWarehouse() != null ? mi.getToWarehouse().getName() : null,
                    mi.getWorkOrder() != null ? mi.getWorkOrder().getId() : null,
                    mi.getWorkOrder() != null ? mi.getWorkOrder().getOrderNo() : null,
                    mi.getWorkOrder() != null ? mi.getWorkOrder().getProduct().getCode() : null,
                    mi.getWorkOrder() != null ? mi.getWorkOrder().getProduct().getName() : null,
                    mi.getEmployeeId(),
                    mi.getProject() != null ? mi.getProject().getId() : null,
                    mi.getProject() != null ? mi.getProject().getName() : null,
                    mi.getQty(), mi.getIssueDate(), mi.getNote());
        }
    }
}
