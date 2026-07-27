package com.erp.accounting.dto;

import com.erp.accounting.domain.CardIssuer;
import jakarta.validation.constraints.NotBlank;

import java.math.BigDecimal;

public final class CardIssuerDtos {

    private CardIssuerDtos() {}

    public record CreateCardIssuerRequest(
            String code,
            @NotBlank(message = "카드사명을 입력하세요.") String name,
            BigDecimal feeRate,
            String remark
    ) {}

    public record UpdateCardIssuerRequest(
            @NotBlank(message = "카드사명을 입력하세요.") String name,
            BigDecimal feeRate,
            String remark,
            Boolean active
    ) {}

    public record CardIssuerResponse(
            Long id, String code, String name, BigDecimal feeRate, String remark, boolean active
    ) {
        public static CardIssuerResponse from(CardIssuer c) {
            return new CardIssuerResponse(c.getId(), c.getCode(), c.getName(), c.getFeeRate(), c.getRemark(), c.isActive());
        }
    }
}
