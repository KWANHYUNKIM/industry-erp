package com.erp.trade.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;

import java.math.BigDecimal;
import java.util.List;

/**
 * 단가일괄변경(판매/구매) DTO 모음.
 * Item 엔티티의 단가 필드는 표준단가(unitPrice) 하나이므로
 * sale/purchase 구분과 무관하게 unitPrice 를 조정한다(신규 컬럼 추가 금지 규칙).
 */
public final class PriceBulkDtos {

    private PriceBulkDtos() {}

    /** 일괄변경 대상 품목 행: 현재 표준단가 + 판매/구매 평균단가(실적 파생) */
    public record PriceBulkItemResponse(
            Long id,
            String code,
            String name,
            String spec,
            String unit,
            /** 판매단가. 판매단가일괄변경의 '현재단가'. */
            BigDecimal unitPrice,
            /** 구매단가. 구매단가일괄변경의 '현재단가'. 0 이면 안 정한 것이다. */
            BigDecimal purchasePrice,
            BigDecimal avgSalePrice,
            BigDecimal avgPurchasePrice
    ) {}

    /**
     * 일괄변경 요청.
     * field: "sale" 이면 판매단가(unitPrice), "purchase" 면 구매단가(purchasePrice) 를 바꾼다.
     * mode:  "rate"(증감율 %, 음수 가능) | "amount"(증감액, 음수 가능)
     */
    public record PriceBulkApplyRequest(
            @NotEmpty(message = "변경할 품목을 선택하세요.") List<Long> itemIds,
            @NotBlank(message = "field(sale|purchase)를 지정하세요.") String field,
            @NotBlank(message = "mode(rate|amount)를 지정하세요.") String mode,
            @NotNull(message = "변경값을 입력하세요.") BigDecimal value
    ) {}

    /** 변경된 품목 1건 결과 */
    public record PriceBulkUpdatedItem(
            Long id,
            String code,
            String name,
            BigDecimal oldPrice,
            BigDecimal newPrice
    ) {}

    /** 일괄변경 결과 */
    public record PriceBulkApplyResponse(
            int updatedCount,
            List<PriceBulkUpdatedItem> items
    ) {}
}
