package com.erp.dto;

import com.erp.domain.PartnerType;

import java.math.BigDecimal;

public final class LedgerDtos {

    private LedgerDtos() {}

    /** 거래처별 채권(매출합계)·채무(매입합계) 현황 */
    public record PartnerBalanceResponse(
            Long partnerId,
            String code,
            String name,
            PartnerType type,
            String typeName,
            BigDecimal receivable,   // 채권 (외상매출금) = 매출 합계
            BigDecimal payable       // 채무 (외상매입금) = 매입 합계
    ) {}
}
