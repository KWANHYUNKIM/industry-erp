package com.erp.quality.dto;

import com.erp.quality.domain.QualityInspection;
import com.erp.quality.domain.QualityInspectionType;
import com.erp.quality.domain.QualityResult;
import jakarta.validation.constraints.Size;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;

public final class QualityDtos {

    private QualityDtos() {}

    public record CreateInspectionRequest(
            LocalDate inspectionDate,
            @NotNull(message = "검사구분을 선택하세요.") QualityInspectionType type,
            @NotNull(message = "품목을 선택하세요.") Long itemId,
            @Size(max = 50, message = "입력한 글자가 너무 깁니다. 50자까지 넣을 수 있습니다.")
            String lotNo,
            /* 원본 조건의 [창고]·[프로젝트]. 검사 시점에 안 정했을 수 있어 필수가 아니다. */
            Long warehouseId,
            Long projectId,
            @NotNull(message = "검사수량을 입력하세요.") @PositiveOrZero(message = "검사수량은 0 이상이어야 합니다.") BigDecimal inspectedQty,
            @PositiveOrZero(message = "불량수량은 0 이상이어야 합니다.") BigDecimal defectQty,
            QualityResult result,
            /** 원본 [불량유형] — 공통코드 DEFECT_TYPE 의 코드. 불량이 없으면 안 준다. */
            @Size(max = 50, message = "입력한 글자가 너무 깁니다. 50자까지 넣을 수 있습니다.")
            String defectType,
            @Size(max = 50, message = "입력한 글자가 너무 깁니다. 50자까지 넣을 수 있습니다.")
            String inspector,
            @Size(max = 300, message = "입력한 글자가 너무 깁니다. 300자까지 넣을 수 있습니다.")
            String remark
    ) {}

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
            String inspector, String remark
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
                    q.getInspector(), q.getRemark());
        }
    }
}
