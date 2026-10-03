package com.erp.quality.inspectionrequest.dto;

import com.erp.quality.inspectionrequest.QualityInspectionRequest;
import com.erp.quality.inspection.QualityInspectionType;
import com.erp.quality.inspectionrequest.QualityRequestStatus;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.Valid;
import com.erp.quality.inspection.InspectionMethod;
import com.erp.quality.inspection.QualityInspection;
import com.erp.quality.inspectionrequest.QualityInspectionRequestLine;
import java.util.List;

import java.math.BigDecimal;
import java.time.LocalDate;

public final class QualityRequestDtos {

    private QualityRequestDtos() {}

    public record CreateRequestReq(
            LocalDate requestDate,
            /* 원본 입력 판에는 검사구분이 없다(2026-10-04) — 안 주면 수입검사. */
            QualityInspectionType type,
            /* 품목 하나짜리 옛 모양(구매 · 판매 입력이 이것으로 낸다). [lines] 를 주면 그쪽을 쓴다. */
            Long itemId,
            String lotNo,
            @Positive(message = "요청수량은 0보다 커야 합니다.") BigDecimal requestQty,
            LocalDate dueDate,
            /** 원본 격자의 [프로젝트]. 안 걸 수도 있다. */
            Long projectId,
            /** 원본 [검사방법] — 전수 · 샘플링. 안 정할 수도 있다. */
            String inspectMethod,
            /** 샘플링일 때의 비율(%). 전수에는 없다. */
            BigDecimal samplePercent,
            String requester,
            String remark,
            /* 원본 품질검사요청입력의 품목 줄(2026-10-04 실측). */
            List<@Valid RequestLineReq> lines
    ) {}

    public record RequestLineReq(
            @NotNull(message = "품목을 선택하세요.") Long itemId,
            InspectionMethod method,
            @NotNull(message = "수량을 입력하세요.") @Positive(message = "수량은 0보다 커야 합니다.") BigDecimal quantity
    ) {}

    public record RequestLineResponse(Long id, int lineNo, Long itemId, String itemCode, String itemName, String spec,
                                      InspectionMethod method, String methodName, BigDecimal quantity) {
        public static RequestLineResponse from(QualityInspectionRequestLine l) {
            return new RequestLineResponse(l.getId(), l.getLineNo(), l.getItem().getId(), l.getItem().getCode(),
                    l.getItem().getName(), l.getItem().getSpec(), l.getMethod(), l.getMethod().getDisplayName(), l.getQuantity());
        }
    }

    /** 원본 요청 목록의 [연결전표] — 이 요청을 불러와 만든 검사. */
    public record LinkedInspection(Long id, String inspectionNo, LocalDate inspectionDate, BigDecimal quantity) {}

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
            String requester, String remark,
            /* 품목 줄 · 이어진 검사(연결전표) · 검사한 수량 합 · 남은 수량(원본 [잔량적용] 이 불러오는 수량). */
            List<RequestLineResponse> lines, List<LinkedInspection> inspections,
            BigDecimal inspectedQty, BigDecimal remainingQty
    ) {
        public static RequestResponse from(QualityInspectionRequest r) {
            return from(r, List.of());
        }

        public static RequestResponse from(QualityInspectionRequest r, List<QualityInspection> linked) {
            List<LinkedInspection> ins = linked.stream().map(q -> new LinkedInspection(q.getId(), q.getInspectionNo(),
                    q.getInspectionDate(), q.getLines().stream().map(l -> l.getQuantity()).reduce(BigDecimal.ZERO, BigDecimal::add)))
                    .toList();
            BigDecimal inspected = ins.stream().map(LinkedInspection::quantity).reduce(BigDecimal.ZERO, BigDecimal::add);
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
                    r.getRequester(), r.getRemark(),
                    r.getLines().stream().map(RequestLineResponse::from).toList(), ins,
                    inspected, r.getRequestQty().subtract(inspected).max(BigDecimal.ZERO));
        }
    }
}
