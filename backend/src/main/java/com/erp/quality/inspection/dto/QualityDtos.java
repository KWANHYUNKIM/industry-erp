package com.erp.quality.inspection.dto;

import com.erp.quality.inspection.QualityInspection;
import com.erp.quality.inspection.QualityInspectionType;
import com.erp.quality.inspection.QualityResult;
import com.erp.quality.inspection.InspectionMethod;
import com.erp.quality.inspection.InspectionPass;
import com.erp.quality.inspection.InspectionStatus;
import com.erp.quality.inspection.QualityInspectionLine;
import jakarta.validation.Valid;
import java.util.List;
import jakarta.validation.constraints.Size;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.PositiveOrZero;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;

public final class QualityDtos {

    private QualityDtos() {}

    public record CreateInspectionRequest(
            LocalDate inspectionDate,
            /* 원본 입력 판에는 검사구분이 없다(2026-10-04) — 안 주면 수입검사. */
            QualityInspectionType type,
            /* 품목 하나짜리 옛 모양. [lines] 를 주면 그쪽을 쓴다. */
            Long itemId,
            @Size(max = 50, message = "입력한 글자가 너무 깁니다. 50자까지 넣을 수 있습니다.")
            String lotNo,
            /* 원본 조건의 [창고]·[프로젝트]. 검사 시점에 안 정했을 수 있어 필수가 아니다. */
            Long warehouseId,
            Long projectId,
            /* 0 개를 검사하면 불량 0 이라 '합격' 으로 남았다(QA 53회차) — 검사한 것이 있어야 판정이 선다. */
            @Positive(message = "검사수량은 0 보다 커야 합니다.") BigDecimal inspectedQty,
            @PositiveOrZero(message = "불량수량은 0 이상이어야 합니다.") BigDecimal defectQty,
            QualityResult result,
            /** 원본 [불량유형] — 공통코드 DEFECT_TYPE 의 코드. 불량이 없으면 안 준다. */
            @Size(max = 50, message = "입력한 글자가 너무 깁니다. 50자까지 넣을 수 있습니다.")
            String defectType,
            @Size(max = 50, message = "입력한 글자가 너무 깁니다. 50자까지 넣을 수 있습니다.")
            String inspector,
            @Size(max = 300, message = "입력한 글자가 너무 깁니다. 300자까지 넣을 수 있습니다.")
            String remark,
            /* 원본 품질검사입력의 품목 줄(2026-10-04 실측). */
            List<@Valid InspectionLineRequest> lines
    ) {}

    /** 품목 줄 — 적격은 서버가 시료 − 부적격으로 셈한다. 전수면 시료 = 수량이다. */
    public record InspectionLineRequest(
            @NotNull(message = "품목을 선택하세요.") Long itemId,
            InspectionMethod method,
            @NotNull(message = "수량을 입력하세요.") @Positive(message = "수량은 0 보다 커야 합니다.") BigDecimal quantity,
            @PositiveOrZero(message = "시료는 0 이상이어야 합니다.") BigDecimal sampleQty,
            @PositiveOrZero(message = "부적격은 0 이상이어야 합니다.") BigDecimal defectQty,
            InspectionPass passResult,
            @Size(max = 50, message = "입력한 글자가 너무 깁니다. 50자까지 넣을 수 있습니다.")
            String defectType
    ) {}

    /** 원본 [종결여부] 바꾸기 — 진행중 ↔ 완료. */
    public record StatusRequest(@NotNull(message = "진행상태를 고르세요.") InspectionStatus status) {}

    public record InspectionLineResponse(
            Long id, int lineNo, Long itemId, String itemCode, String itemName, String spec,
            InspectionMethod method, String methodName,
            BigDecimal quantity, BigDecimal sampleQty, BigDecimal goodQty, BigDecimal defectQty,
            InspectionPass passResult, String passResultName, String defectType
    ) {
        public static InspectionLineResponse from(QualityInspectionLine l) {
            return new InspectionLineResponse(
                    l.getId(), l.getLineNo(), l.getItem().getId(), l.getItem().getCode(), l.getItem().getName(),
                    l.getItem().getSpec(),
                    l.getMethod(), l.getMethod().getDisplayName(),
                    l.getQuantity(), l.getSampleQty(), l.getSampleQty().subtract(l.getDefectQty()), l.getDefectQty(),
                    l.getPassResult(), l.getPassResult().getDisplayName(), l.getDefectType());
        }
    }

    public record InspectionResponse(
            Long id, String inspectionNo, LocalDate inspectionDate,
            QualityInspectionType type, String typeName,
            Long itemId, String itemCode, String itemName, String unit,
            String lotNo,
            /** 등록된 로트와 연결된 경우의 로트 id. 미등록 로트면 null. */
            Long lotId,
            BigDecimal inspectedQty, BigDecimal defectQty, BigDecimal goodQty, BigDecimal defectRate,
            QualityResult result, String resultName,
            Long warehouseId, String warehouseName,
            Long projectId, String projectName,
            /** 원본 [불량유형]. 공통코드 DEFECT_TYPE 의 코드다 — 화면이 이름을 붙인다. */
            String defectType,
            String inspector, String remark,
            /* 원본 [종결여부] · 품목 줄 · 줄 수량 합(원본 목록 [수량]). */
            InspectionStatus status, String statusName,
            List<InspectionLineResponse> lines, BigDecimal totalQuantity
    ) {
        public static InspectionResponse from(QualityInspection q) {
            BigDecimal good = q.getInspectedQty().subtract(q.getDefectQty());
            BigDecimal rate = q.getInspectedQty().signum() > 0
                    ? q.getDefectQty().multiply(BigDecimal.valueOf(100))
                        .divide(q.getInspectedQty(), 1, RoundingMode.HALF_UP)
                    : BigDecimal.ZERO;
            return new InspectionResponse(
                    q.getId(), q.getInspectionNo(), q.getInspectionDate(),
                    q.getType(), q.getType().getDisplayName(),
                    q.getItem().getId(), q.getItem().getCode(), q.getItem().getName(), q.getItem().getUnit(),
                    q.getLotNo(),
                    q.getLot() != null ? q.getLot().getId() : null,
                    q.getInspectedQty(), q.getDefectQty(), good, rate,
                    q.getResult(), q.getResult().getDisplayName(),
                    q.getWarehouse() != null ? q.getWarehouse().getId() : null,
                    q.getWarehouse() != null ? q.getWarehouse().getName() : null,
                    q.getProject() != null ? q.getProject().getId() : null,
                    q.getProject() != null ? q.getProject().getName() : null,
                    q.getDefectType(),
                    q.getInspector(), q.getRemark(),
                    q.getStatus(), q.getStatus().getDisplayName(),
                    q.getLines().stream().map(InspectionLineResponse::from).toList(),
                    q.getLines().stream().map(QualityInspectionLine::getQuantity).reduce(BigDecimal.ZERO, BigDecimal::add));
        }
    }
}
