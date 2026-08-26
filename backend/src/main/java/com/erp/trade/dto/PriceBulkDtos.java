package com.erp.trade.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;

import java.math.BigDecimal;
import java.util.List;

/**
 * 단가일괄변경(판매/구매) DTO 모음.
 *
 * <p>두 갈래가 있다.
 * <ul>
 *   <li><b>전표 단가</b> — 원본(이카운트)의 판매/구매단가일괄변경이 하는 일.
 *       기간·거래처·품목·창고 조건으로 <b>이미 입력한 전표의 라인</b>을 뽑아 단가를 고친다.
 *       금액(공급가액·부가세·합계)이 그 자리에서 다시 계산된다.</li>
 *   <li><b>품목 표준단가</b> — 앞으로 입력할 전표에 채워질 기준값을 조정한다.
 *       원본에는 이 이름의 화면이 없지만 쓸모가 있어 같은 화면의 [구분]으로 남겨 둔다.</li>
 * </ul>
 * 예전에는 뒤엣것만 있었다. 화면 이름은 원본과 같은데 하는 일이 달라서,
 * "지난달 판매단가를 고쳐 달라"는 요청에 아무 답이 안 됐다.
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
    /** 전표 단가변경 대상 라인 한 줄. */
    public record SlipLineRow(
            /** 전표 라인 id — 변경 요청에 이 값을 그대로 돌려준다. */
            Long lineId,
            Long slipId,
            String docNo,
            java.time.LocalDate slipDate,
            String partnerName,
            String employeeName,
            String warehouseName,
            /** 과세/면세. 우리 전표에는 외화가 없어 원본의 [환율] 열은 만들지 않는다. */
            String taxTypeName,
            String itemCode,
            String itemName,
            String spec,
            String unit,
            BigDecimal quantity,
            BigDecimal unitPrice,
            BigDecimal supplyAmount,
            BigDecimal vatAmount,
            /** 확인된 전표는 단가를 못 고친다. 화면에서 미리 잠근다. */
            boolean editable,
            String lockReason
    ) {}

    public record SlipPriceChange(
            @NotNull(message = "전표 라인을 지정하세요.") Long lineId,
            @NotNull(message = "단가를 입력하세요.")
            @jakarta.validation.constraints.PositiveOrZero(message = "단가는 0 이상이어야 합니다.")
            BigDecimal unitPrice
    ) {}

    public record SlipPriceApplyRequest(
            @NotBlank(message = "판매/구매 구분을 지정하세요.") String tradeType,
            /**
             * 원소마다 {@code @Valid} 를 붙여야 한다. 안 붙이면 <b>리스트 안쪽 제약이 통째로
             * 무시된다</b> — 실제로 음수 단가가 그대로 저장돼 공급가액이 음수가 됐다.
             */
            @NotEmpty(message = "변경할 전표 라인을 선택하세요.") List<@jakarta.validation.Valid SlipPriceChange> changes
    ) {}

    public record SlipPriceApplyResponse(
            int changedLines,
            int changedSlips,
            List<String> docNos
    ) {}

    public record PriceBulkApplyResponse(
            int updatedCount,
            List<PriceBulkUpdatedItem> items
    ) {}
}
