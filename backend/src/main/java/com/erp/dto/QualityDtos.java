package com.erp.dto;

import com.erp.domain.QualityInspection;
import com.erp.domain.QualityInspectionType;
import com.erp.domain.QualityResult;
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
            String lotNo,
            @NotNull @PositiveOrZero(message = "검사수량은 0 이상이어야 합니다.") BigDecimal inspectedQty,
            @PositiveOrZero(message = "불량수량은 0 이상이어야 합니다.") BigDecimal defectQty,
            QualityResult result,
            String inspector,
            String remark
    ) {}

    public record InspectionResponse(
            Long id, String inspectionNo, LocalDate inspectionDate,
            QualityInspectionType type, String typeName,
            Long itemId, String itemCode, String itemName, String unit,
            String lotNo,
            BigDecimal inspectedQty, BigDecimal defectQty, BigDecimal goodQty, BigDecimal defectRate,
            QualityResult result, String resultName,
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
                    q.getInspectedQty(), q.getDefectQty(), good, rate,
                    q.getResult(), q.getResult().getDisplayName(),
                    q.getInspector(), q.getRemark());
        }
    }
}
