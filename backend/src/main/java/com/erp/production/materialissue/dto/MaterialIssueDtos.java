package com.erp.production.materialissue.dto;

import com.erp.production.materialissue.MaterialIssue;
import com.erp.inventory.item.ItemCategory;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Size;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
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
            @Size(max = 300, message = "입력한 글자가 너무 깁니다. 300자까지 넣을 수 있습니다.")
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
            String note,
            /**
             * 이 줄의 작업지시서. 원본은 [작업지시서] 로 여러 지시를 한 번에 불러와
             * 줄마다 다른 지시에 묶인다. 안 주면 머리의 작업지시를 쓴다.
             */
            Long workOrderId
    ) {}

    /**
     * 작업지시서를 불러올 때 채울 <b>소요자재</b> 한 줄. 원본 생산불출입력의
     * [작업지시서] → [잔량으로BOM풀기]·[BOM풀기] 가 이것으로 격자를 채운다.
     *
     * <p>requiredQty = BOM 소요량 × 지시수량, issuedQty = 그 지시로 이미 불출한 양,
     * remainingQty = 둘의 차(0 밑으로는 안 간다).
     */
    public record WorkOrderRequirement(
            Long workOrderId, String workOrderNo, LocalDate orderDate,
            Long productId, String productCode, String productName,
            BigDecimal plannedQty,
            Long partnerId, String partnerName, Long employeeId,
            Long componentId, String componentCode, String componentName, String componentSpec, String unit,
            BigDecimal bomQty, BigDecimal requiredQty, BigDecimal issuedQty, BigDecimal remainingQty
    ) {}

    /** 원본 [진행상태변경] — 고른 불출 전표들을 미확인 ↔ 확인. */
    public record ChangeStatusRequest(
            @jakarta.validation.constraints.NotEmpty(message = "바꿀 전표를 고르세요.") java.util.List<String> issueNos,
            @NotNull(message = "바꿀 진행상태를 고르세요.") com.erp.production.production.ProductionConfirmStatus status
    ) {}

    public record MaterialIssueResponse(
            Long id,
            /** 불출 전표번호. 원본 [일자-No.] 의 뒷부분이다. */
            String issueNo,
            Long itemId, String itemCode, String itemName, String unit,
            /** 규격. 원본 생산불출조회의 열 이름이 [품목명[규격명]] 이다. */
            String itemSpec,
            /** 원본 조건 <b>[품목구분]</b>. 원재료를 낸 것인지 부재료를 낸 것인지로 먼저 갈라 본다. */
            ItemCategory itemCategory, String itemCategoryName,
            Long warehouseId, String warehouseName,
            /** 받는공장 */
            Long toWarehouseId, String toWarehouseName,
            Long workOrderId, String workOrderNo,
            /**
             * 그 작업지시를 <b>낸 날</b>. 원본 생산불출조회의 [불러온 전표일자] 다 —
             * 우리가 불출을 불러오는 전표는 작업지시서뿐이다.
             * 언제 낸 지시를 보고 불출했는지는 번호만으로는 알 수 없다.
             */
            java.time.LocalDate workOrderDate,
            /**
             * 작업지시가 가리키는 <b>생산품목</b>. 원본 생산불출입력 머리의 [생산품목] 이고
             * 그리드의 [작업지시품목코드] 이기도 하다. 작업지시 없이 낸 불출이면 null.
             */
            String productCode, String productName,
            /** 담당자(사원) id. 이름은 화면이 붙인다 — production 은 hr 을 참조할 수 없다. */
            Long employeeId,
            /** 귀속 프로젝트. 원본 머리의 [프로젝트]. */
            Long projectId, String projectName,
            BigDecimal qty, LocalDate issueDate, String note,
            /**
             * 원본 조건 [최초작성일자] · [최종작업일자], 그리고 [기타]의
             * <b>수정일자순(정렬)</b>. MaterialIssue 는 BaseTimeEntity 를 물려받아
             * 두 칸을 진작 채우고 있는데 응답이 안 실었다.
             *
             * <p>원본에는 [최초작성자]도 있으나 <b>만든 사람은 안 남긴다</b> —
             * MaterialIssue 에 createdBy 칸이 없다(판매·구매·출하와 다르다).
             */
            LocalDateTime createdAt, LocalDateTime updatedAt
    ,
            /** 진행상태 — 결재중·미확인·확인. */
            com.erp.production.production.ProductionConfirmStatus confirmStatus) {
        public static MaterialIssueResponse from(MaterialIssue mi) {
            return new MaterialIssueResponse(
                    mi.getId(), mi.getIssueNo(),
                    mi.getItem().getId(), mi.getItem().getCode(), mi.getItem().getName(), mi.getItem().getUnit(),
                    mi.getItem().getSpec(),
                    mi.getItem().getCategory(),
                    mi.getItem().getCategory() != null ? mi.getItem().getCategory().getDisplayName() : null,
                    mi.getWarehouse() != null ? mi.getWarehouse().getId() : null,
                    mi.getWarehouse() != null ? mi.getWarehouse().getName() : null,
                    mi.getToWarehouse() != null ? mi.getToWarehouse().getId() : null,
                    mi.getToWarehouse() != null ? mi.getToWarehouse().getName() : null,
                    mi.getWorkOrder() != null ? mi.getWorkOrder().getId() : null,
                    mi.getWorkOrder() != null ? mi.getWorkOrder().getOrderNo() : null,
                    mi.getWorkOrder() != null ? mi.getWorkOrder().getOrderDate() : null,
                    mi.getWorkOrder() != null ? mi.getWorkOrder().getProduct().getCode() : null,
                    mi.getWorkOrder() != null ? mi.getWorkOrder().getProduct().getName() : null,
                    mi.getEmployeeId(),
                    mi.getProject() != null ? mi.getProject().getId() : null,
                    mi.getProject() != null ? mi.getProject().getName() : null,
                    mi.getQty(), mi.getIssueDate(), mi.getNote(),
                    mi.getCreatedAt(), mi.getUpdatedAt(),
                    mi.getConfirmStatus());
        }
    }
}
