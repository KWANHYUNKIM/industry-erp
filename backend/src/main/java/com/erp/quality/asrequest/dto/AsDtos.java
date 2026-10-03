package com.erp.quality.asrequest.dto;

import com.erp.inventory.item.ItemCategory;
import com.erp.quality.asrequest.AsRequest;
import com.erp.quality.asrequest.AsStatus;
import jakarta.validation.constraints.Size;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;

import java.math.BigDecimal;
import java.util.List;
import java.time.LocalDate;
import java.time.LocalDateTime;

public final class AsDtos {

    private AsDtos() {}

    public record AsLineRequest(
            @NotNull(message = "품목을 선택하세요.") Long itemId,
            @NotNull(message = "수량을 입력하세요.") @Positive(message = "수량은 0보다 커야 합니다.") BigDecimal quantity
    ) {}

    public record AsLineResponse(Long id, int lineNo, Long itemId, String itemCode, String itemName, String itemSpec,
                                 BigDecimal quantity) {
        public static AsLineResponse from(com.erp.quality.asrequest.AsRequestLine l) {
            return new AsLineResponse(l.getId(), l.getLineNo(), l.getItem().getId(), l.getItem().getCode(),
                    l.getItem().getName(), l.getItem().getSpec(), l.getQuantity());
        }
    }

    public record CreateAsRequest(
            @NotNull(message = "거래처를 선택하세요.") Long partnerId,
            /* 예전 한 품목 접수. lines 가 없으면 이 품목 1개로 한 줄을 만든다. */
            Long itemId,
            LocalDate receiptDate,
            /* 원본 A/S접수입력은 [창고]가 없으면 저장하지 않는다(2026-10-03 실측, 빨간 테두리). */
            @NotNull(message = "창고를 선택하세요.") Long warehouseId,
            Long projectId,
            @Size(max = 200, message = "입력한 글자가 너무 깁니다. 200자까지 넣을 수 있습니다.")
            String title,
            LocalDate scheduledDate,
            @Size(max = 500, message = "입력한 글자가 너무 깁니다. 500자까지 넣을 수 있습니다.")
            String symptom,
            @Size(max = 50, message = "입력한 글자가 너무 깁니다. 50자까지 넣을 수 있습니다.")
            String charge,
            /** 원본 격자의 품목 줄. */
            List<@jakarta.validation.Valid AsLineRequest> lines
    ) {}

    /**
     * 원본 A/S접수수정은 <b>일자만 잠그고</b> 나머지는 다 고친다(2026-10-03 실측). null 이면 그대로 둔다.
     */
    public record UpdateAsRequest(
            AsStatus status,
            Long partnerId,
            Long warehouseId,
            Long projectId,
            @Size(max = 500, message = "입력한 글자가 너무 깁니다. 500자까지 넣을 수 있습니다.")
            String symptom,
            List<@jakarta.validation.Valid AsLineRequest> lines,
            @Size(max = 50, message = "입력한 글자가 너무 깁니다. 50자까지 넣을 수 있습니다.")
            String charge,
            @Size(max = 200, message = "입력한 글자가 너무 깁니다. 200자까지 넣을 수 있습니다.")
            String title,
            LocalDate scheduledDate,
            @Size(max = 500, message = "입력한 글자가 너무 깁니다. 500자까지 넣을 수 있습니다.")
            String repairNote,
            LocalDate doneDate
    ) {}

    public record AsResponse(
            Long id, String asNo,
            Long partnerId, String partnerName,
            Long itemId, String itemName,
            /**
             * 품목코드와 규격. A/S접수현황(E040610)의 격자가 <b>[품목코드]</b> 와
             * <b>[품목명[규격]]</b> 을 나란히 둔다(2026-09-09 실측) - 품목 마스터가 진작
             * 들고 있는 값인데 응답이 안 싣고 있었다.
             */
            String itemCode, String itemSpec,
            /** 원본 조건 <b>[품목구분]</b>. 품목 마스터의 값이라 실어 주기만 한다. */
            ItemCategory itemCategory, String itemCategoryName,
            LocalDate receiptDate,
            String title, LocalDate scheduledDate,
            Long warehouseId, String warehouseName,
            Long projectId, String projectName,
            String symptom, String charge,
            AsStatus status, String statusName,
            LocalDate doneDate, String repairNote,
            /**
             * 원본 조건 [최초작성자] · [최초작성일자] · [최종작업일자], 그리고 [기타]의
             * <b>수정일자순(정렬)</b>. AsRequest 는 createdBy 를 들고 BaseTimeEntity 도
             * 물려받는데 응답이 셋 다 안 실었다.
             */
            String createdBy, LocalDateTime createdAt, LocalDateTime updatedAt,
            /** 원본 A/S접수 품목 격자와 그 [수량] 합계줄. */
            List<AsLineResponse> lines, BigDecimal totalQuantity
    ) {
        public static AsResponse from(AsRequest a) {
            return new AsResponse(
                    a.getId(), a.getAsNo(),
                    a.getPartner().getId(), a.getPartner().getName(),
                    a.getItem().getId(), a.getItem().getName(),
                    a.getItem().getCode(), a.getItem().getSpec(),
                    a.getItem().getCategory(),
                    a.getItem().getCategory() != null ? a.getItem().getCategory().getDisplayName() : null,
                    a.getReceiptDate(),
                    a.getTitle(), a.getScheduledDate(),
                    a.getWarehouse() != null ? a.getWarehouse().getId() : null,
                    a.getWarehouse() != null ? a.getWarehouse().getName() : null,
                    a.getProject() != null ? a.getProject().getId() : null,
                    a.getProject() != null ? a.getProject().getName() : null,
                    a.getSymptom(), a.getCharge(),
                    a.getStatus(), a.getStatus().getDisplayName(),
                    a.getDoneDate(), a.getRepairNote(),
                    a.getCreatedBy(), a.getCreatedAt(), a.getUpdatedAt(),
                    a.getLines().stream().map(AsLineResponse::from).toList(),
                    a.getLines().stream().map(com.erp.quality.asrequest.AsRequestLine::getQuantity)
                            .reduce(BigDecimal.ZERO, BigDecimal::add));
        }
    }
}
