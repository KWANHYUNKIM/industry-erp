package com.erp.trade.dto;

import com.erp.trade.domain.SpecialPrice;
import com.erp.trade.domain.enums.SpecialPriceType;
import jakarta.validation.constraints.Size;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;

import java.math.BigDecimal;

import java.time.LocalDateTime;

public final class SpecialPriceDtos {

    private SpecialPriceDtos() {}

    /**
     * 특별단가 등록 요청.
     * partnerId 와 priceGroup 중 <b>정확히 하나</b>를 지정한다(거래처별 또는 그룹별).
     */
    public record CreateSpecialPriceRequest(
            @NotNull(message = "판매/구매 구분을 선택하세요.") SpecialPriceType tradeType,
            @NotNull(message = "품목을 선택하세요.") Long itemId,
            Long partnerId,
            @Size(max = 50, message = "입력한 글자가 너무 깁니다. 50자까지 넣을 수 있습니다.")
            String priceGroup,
            @NotNull(message = "특별단가를 입력하세요.") @PositiveOrZero(message = "특별단가는 0 이상이어야 합니다.") BigDecimal unitPrice,
            @Size(max = 300, message = "입력한 글자가 너무 깁니다. 300자까지 넣을 수 있습니다.")
            String remark
    ) {}

    public record SpecialPriceResponse(
            Long id,
            SpecialPriceType tradeType,
            Long itemId, String itemCode, String itemName, String unit,
            Long partnerId, String partnerName,
            String priceGroup,
            BigDecimal unitPrice,
            boolean active,
            String remark, String createdBy,
            /*
             * 원본 특별단가등록의 <b>[수정일자순]</b> 정렬이 쓰는 값. BaseTimeEntity 가 이미
             * 들고 있는데 응답에 안 실려서 <b>정렬 기준으로 쓸 수가 없었다.</b>
             */
            LocalDateTime updatedAt
    ) {
        public static SpecialPriceResponse from(SpecialPrice sp) {
            return new SpecialPriceResponse(
                    sp.getId(),
                    sp.getTradeType(),
                    sp.getItem().getId(), sp.getItem().getCode(), sp.getItem().getName(), sp.getItem().getUnit(),
                    sp.getPartner() != null ? sp.getPartner().getId() : null,
                    sp.getPartner() != null ? sp.getPartner().getName() : null,
                    sp.getPriceGroup(),
                    sp.getUnitPrice(),
                    sp.isActive(),
                    sp.getRemark(), sp.getCreatedBy(), sp.getUpdatedAt());
        }
    }

    /** 유효 특별단가 해석 결과. found=false 면 특별단가 없음(표준단가 사용). */
    public record ResolveResponse(
            boolean found,
            BigDecimal unitPrice,
            String source,     // "PARTNER" | "GROUP" | null
            String priceGroup
    ) {
        public static ResolveResponse none() {
            return new ResolveResponse(false, null, null, null);
        }
    }
}
