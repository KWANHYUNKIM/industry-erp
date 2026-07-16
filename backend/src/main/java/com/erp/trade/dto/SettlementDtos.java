package com.erp.trade.dto;

import com.erp.trade.domain.Settlement;
import com.erp.trade.domain.SettlementType;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;

import java.math.BigDecimal;
import java.time.LocalDate;

public final class SettlementDtos {

    private SettlementDtos() {}

    public record CreateSettlementRequest(
            @NotNull(message = "유형을 선택하세요.") SettlementType type,
            @NotNull(message = "거래처를 선택하세요.") Long partnerId,
            @NotNull @Positive(message = "금액은 0보다 커야 합니다.") BigDecimal amount,
            String method,
            LocalDate settleDate,
            String note
    ) {}

    public record SettlementResponse(
            Long id, String docNo,
            SettlementType type, String typeName,
            Long partnerId, String partnerName,
            LocalDate settleDate,
            BigDecimal amount,
            String method, String note, String createdBy
    ) {
        public static SettlementResponse from(Settlement s) {
            return new SettlementResponse(
                    s.getId(), s.getDocNo(),
                    s.getType(), s.getType().getDisplayName(),
                    s.getPartner().getId(), s.getPartner().getName(),
                    s.getSettleDate(), s.getAmount(),
                    s.getMethod(), s.getNote(), s.getCreatedBy());
        }
    }
}
