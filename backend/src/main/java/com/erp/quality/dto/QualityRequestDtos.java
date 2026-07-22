package com.erp.quality.dto;

import com.erp.quality.domain.QualityInspectionRequest;
import com.erp.quality.domain.QualityInspectionType;
import com.erp.quality.domain.QualityRequestStatus;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;

import java.math.BigDecimal;
import java.time.LocalDate;

public final class QualityRequestDtos {

    private QualityRequestDtos() {}

    public record CreateRequestReq(
            LocalDate requestDate,
            @NotNull(message = "검사구분을 선택하세요.") QualityInspectionType type,
            @NotNull(message = "품목을 선택하세요.") Long itemId,
            String lotNo,
            @NotNull @Positive(message = "요청수량은 0보다 커야 합니다.") BigDecimal requestQty,
            LocalDate dueDate,
            String requester,
            String remark
    ) {}

    public record UpdateStatusReq(
            @NotNull QualityRequestStatus status
    ) {}

    public record RequestResponse(
            Long id, String requestNo, LocalDate requestDate,
            QualityInspectionType type, String typeName,
            Long itemId, String itemCode, String itemName, String unit,
            String lotNo,
            BigDecimal requestQty, LocalDate dueDate,
            QualityRequestStatus status, String statusName,
            String requester, String remark
    ) {
        public static RequestResponse from(QualityInspectionRequest r) {
            return new RequestResponse(
                    r.getId(), r.getRequestNo(), r.getRequestDate(),
                    r.getType(), r.getType().getDisplayName(),
                    r.getItem().getId(), r.getItem().getCode(), r.getItem().getName(), r.getItem().getUnit(),
                    r.getLotNo(),
                    r.getRequestQty(), r.getDueDate(),
                    r.getStatus(), r.getStatus().getDisplayName(),
                    r.getRequester(), r.getRemark());
        }
    }
}
