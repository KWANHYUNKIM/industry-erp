package com.erp.production.bom.dto;

import com.erp.production.bom.Bom;
import com.erp.production.bom.BomLine;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Size;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;

import java.math.BigDecimal;
import java.util.List;

public final class BomDtos {

    private BomDtos() {}

    public record BomLineRequest(
            @NotNull(message = "자재를 선택하세요.") Long componentId,
            @NotNull(message = "소요량을 입력하세요.") @Positive(message = "소요량은 0보다 커야 합니다.") BigDecimal quantity
    ) {}

    /** BOM 생성/수정 (제품 기준으로 upsert) */
    public record SaveBomRequest(
            @NotNull(message = "제품을 선택하세요.") Long productId,
            @Size(max = 300, message = "입력한 글자가 너무 깁니다. 300자까지 넣을 수 있습니다.")
            String remark,
            @NotEmpty(message = "자재를 1개 이상 입력하세요.") @Valid List<BomLineRequest> lines,
            /** 원본 [BOM버전] 이름. 비우면 '기본'. 같은 제품·같은 버전이면 그 버전을 고친다. */
            @Size(max = 50, message = "BOM버전은 50자까지 넣을 수 있습니다.") String versionName,
            /** 이 버전을 기본 BOM 으로. 제품의 첫 BOM 은 저절로 기본이다. */
            Boolean defaultVersion
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
            List<BomLineResponse> lines,
            /** 원본 [BOM버전] · [기본BOM]. */
            String versionName, boolean defaultVersion
    ) {
        public static BomResponse from(Bom b) {
            return new BomResponse(
                    b.getId(),
                    b.getProduct().getId(), b.getProduct().getCode(), b.getProduct().getName(), b.getProduct().getUnit(),
                    b.getRemark(), b.isActive(),
                    b.getLines().stream().map(BomLineResponse::from).toList(),
                    b.getVersionName(), b.isDefaultVersion());
        }
    }
}
