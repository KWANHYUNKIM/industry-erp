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
            @NotNull(message = "요청수량을 입력하세요.") @Positive(message = "요청수량은 0보다 커야 합니다.") BigDecimal requestQty,
            LocalDate dueDate,
            /** 원본 격자의 [프로젝트]. 안 걸 수도 있다. */
            Long projectId,
            /** 원본 [검사방법] — 전수 · 샘플링. 안 정할 수도 있다. */
            String inspectMethod,
            /** 샘플링일 때의 비율(%). 전수에는 없다. */
            BigDecimal samplePercent,
            String requester,
            String remark
    ) {}

    public record UpdateStatusReq(
            @NotNull(message = "진행상태를 선택하세요.") QualityRequestStatus status
    ) {}

    public record RequestResponse(
            Long id, String requestNo, LocalDate requestDate,
            QualityInspectionType type, String typeName,
            Long itemId, String itemCode, String itemName,
            /* 원본 품질검사요청 격자의 [규격]. 품목이 들고 있는데 응답에 안 실려 열로 못 냈다. */
            String spec,
            String unit,
            String lotNo,
            BigDecimal requestQty, LocalDate dueDate,
            QualityRequestStatus status, String statusName,
            /** 원본 격자의 [프로젝트]. 안 걸었으면 null. */
            Long projectId, String projectName,
            /** 원본 [검사방법]과 그 비율. 안 정했으면 null. */
            String inspectMethod, BigDecimal samplePercent,
            String requester, String remark
    ) {
        public static RequestResponse from(QualityInspectionRequest r) {
            return new RequestResponse(
                    r.getId(), r.getRequestNo(), r.getRequestDate(),
                    r.getType(), r.getType().getDisplayName(),
                    r.getItem().getId(), r.getItem().getCode(), r.getItem().getName(),
                    r.getItem().getSpec(), r.getItem().getUnit(),
                    r.getLotNo(),
                    r.getRequestQty(), r.getDueDate(),
                    r.getStatus(), r.getStatus().getDisplayName(),
                    r.getProject() != null ? r.getProject().getId() : null,
                    r.getProject() != null ? r.getProject().getName() : null,
                    r.getInspectMethod(), r.getSamplePercent(),
                    r.getRequester(), r.getRemark());
        }
    }
}
