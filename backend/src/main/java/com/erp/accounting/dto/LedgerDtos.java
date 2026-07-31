package com.erp.accounting.dto;

import com.erp.trade.domain.PartnerType;

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
            BigDecimal receivable,   // 채권 (외상매출금) = 매출 합계 − 수금
            BigDecimal payable,      // 채무 (외상매입금) = 매입 합계 − 지급
            // ── 채권/채무현황(E040703·E040721) 조건용. 기존 화면은 무시해도 되는 추가 필드.
            Long partnerGroupId,
            String partnerGroupName,
            String manager,          // 거래처관리담당자
            boolean active           // false 면 사용중단 거래처
    ) {}
}
