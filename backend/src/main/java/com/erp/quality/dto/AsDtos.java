package com.erp.quality.dto;

import com.erp.quality.domain.AsPart;
import com.erp.quality.domain.AsRequest;
import com.erp.quality.domain.AsStatus;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;

import java.math.BigDecimal;
import java.time.LocalDate;

public final class AsDtos {

    private AsDtos() {}

    /** A/S 소모부품 등록 요청. 등록 시 창고 재고를 차감한다. */
    public record CreateAsPartRequest(
            @NotNull(message = "품목을 선택하세요.") Long itemId,
            @NotNull(message = "창고를 선택하세요.") Long warehouseId,
            @NotNull(message = "수량을 입력하세요.") @Positive(message = "수량은 0보다 커야 합니다.") BigDecimal quantity,
            BigDecimal unitPrice,
            String remark
    ) {}

    public record AsPartResponse(
            Long id, Long asRequestId, String asNo,
            Long itemId, String itemName,
            Long warehouseId, String warehouseName,
            BigDecimal quantity, BigDecimal unitPrice, BigDecimal amount,
            String remark, String createdBy
    ) {
        public static AsPartResponse from(AsPart p) {
            BigDecimal amount = p.getUnitPrice() != null ? p.getUnitPrice().multiply(p.getQuantity()) : null;
            return new AsPartResponse(
                    p.getId(), p.getAsRequest().getId(), p.getAsRequest().getAsNo(),
                    p.getItem().getId(), p.getItem().getName(),
                    p.getWarehouse().getId(), p.getWarehouse().getName(),
                    p.getQuantity(), p.getUnitPrice(), amount,
                    p.getRemark(), p.getCreatedBy());
        }
    }

    /** A/S소모현황 — 품목별 소모 집계. */
    public record AsConsumptionRow(
            Long itemId, String itemName,
            long asCount, BigDecimal totalQty, BigDecimal totalAmount
    ) {}

    public record CreateAsRequest(
            @NotNull(message = "거래처를 선택하세요.") Long partnerId,
            @NotNull(message = "품목을 선택하세요.") Long itemId,
            LocalDate receiptDate,
            String title,
            LocalDate scheduledDate,
            String symptom,
            String charge
    ) {}

    public record UpdateAsRequest(
            AsStatus status,
            String charge,
            String title,
            LocalDate scheduledDate,
            String repairNote,
            LocalDate doneDate
    ) {}

    public record AsResponse(
            Long id, String asNo,
            Long partnerId, String partnerName,
            Long itemId, String itemName,
            LocalDate receiptDate,
            String title, LocalDate scheduledDate,
            String symptom, String charge,
            AsStatus status, String statusName,
            LocalDate doneDate, String repairNote
    ) {
        public static AsResponse from(AsRequest a) {
            return new AsResponse(
                    a.getId(), a.getAsNo(),
                    a.getPartner().getId(), a.getPartner().getName(),
                    a.getItem().getId(), a.getItem().getName(),
                    a.getReceiptDate(),
                    a.getTitle(), a.getScheduledDate(),
                    a.getSymptom(), a.getCharge(),
                    a.getStatus(), a.getStatus().getDisplayName(),
                    a.getDoneDate(), a.getRepairNote());
        }
    }
}
