package com.erp.quality.dto;

import com.erp.quality.domain.AsRequest;
import com.erp.quality.domain.AsStatus;
import jakarta.validation.constraints.NotNull;

import java.time.LocalDate;

public final class AsDtos {

    private AsDtos() {}

    public record CreateAsRequest(
            @NotNull(message = "거래처를 선택하세요.") Long partnerId,
            @NotNull(message = "품목을 선택하세요.") Long itemId,
            LocalDate receiptDate,
            String symptom,
            String charge
    ) {}

    public record UpdateAsRequest(
            AsStatus status,
            String charge,
            String repairNote,
            LocalDate doneDate
    ) {}

    public record AsResponse(
            Long id, String asNo,
            Long partnerId, String partnerName,
            Long itemId, String itemName,
            LocalDate receiptDate,
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
                    a.getSymptom(), a.getCharge(),
                    a.getStatus(), a.getStatus().getDisplayName(),
                    a.getDoneDate(), a.getRepairNote());
        }
    }
}
