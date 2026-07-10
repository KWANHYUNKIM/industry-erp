package com.erp.dto;

import com.erp.domain.Bom;
import com.erp.domain.BomLine;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;

import java.math.BigDecimal;
import java.util.List;

public final class BomDtos {

    private BomDtos() {}

    public record BomLineRequest(
            @NotNull(message = "자재를 선택하세요.") Long componentId,
            @NotNull @Positive(message = "소요량은 0보다 커야 합니다.") BigDecimal quantity
    ) {}

    /** BOM 생성/수정 (제품 기준으로 upsert) */
    public record SaveBomRequest(
            @NotNull(message = "제품을 선택하세요.") Long productId,
            String remark,
            @NotEmpty(message = "자재를 1개 이상 입력하세요.") @Valid List<BomLineRequest> lines
    ) {}

    public record BomLineResponse(
            Long componentId, String componentCode, String componentName, String unit, BigDecimal quantity
    ) {
        static BomLineResponse from(BomLine l) {
            return new BomLineResponse(
                    l.getComponent().getId(), l.getComponent().getCode(), l.getComponent().getName(),
                    l.getComponent().getUnit(), l.getQuantity());
        }
    }

    public record BomResponse(
            Long id,
            Long productId, String productCode, String productName, String productUnit,
            String remark, boolean active,
            List<BomLineResponse> lines
    ) {
        public static BomResponse from(Bom b) {
            return new BomResponse(
                    b.getId(),
                    b.getProduct().getId(), b.getProduct().getCode(), b.getProduct().getName(), b.getProduct().getUnit(),
                    b.getRemark(), b.isActive(),
                    b.getLines().stream().map(BomLineResponse::from).toList());
        }
    }
}
