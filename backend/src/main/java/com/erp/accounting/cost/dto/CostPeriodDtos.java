package com.erp.accounting.cost.dto;

import com.erp.accounting.cost.CostMethod;
import com.erp.accounting.cost.CostPeriod;
import com.erp.accounting.cost.OutsourcingBasis;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.util.List;

public final class CostPeriodDtos {

    private CostPeriodDtos() {}

    /** 원본 [신규] 기본등록. 앞 기간이 있으면 시작월은 서버가 그 다음 달로 정한다(화면에서도 잠김). */
    public record CreateCostPeriodRequest(
            @Size(max = 7, message = "시작월을 확인하세요.")
            @Pattern(regexp = "\\d{4}-\\d{2}", message = "시작월을 확인하세요.") String startMonth,
            @NotBlank(message = "종료월을 입력하세요.") @Size(max = 7, message = "종료월을 확인하세요.")
            @Pattern(regexp = "\\d{4}-\\d{2}", message = "종료월을 확인하세요.") String endMonth,
            @NotNull(message = "원가계산법을 선택하세요.") CostMethod method,
            @NotNull(message = "외주비기준을 선택하세요.") OutsourcingBasis outsourcingBasis
    ) {}

    /** 목록 한 줄 — 원본 열 [기준년월 · 원가계산방법 · 계산기준] 과 지금 어디까지 했나. */
    public record CostPeriodResponse(
            Long id, String startMonth, String endMonth,
            CostMethod method, String methodName,
            OutsourcingBasis outsourcingBasis, String outsourcingBasisName,
            boolean generated, boolean latest
    ) {
        public static CostPeriodResponse from(CostPeriod p, boolean latest) {
            return new CostPeriodResponse(p.getId(), p.getStartMonth(), p.getEndMonth(),
                    p.getMethod(), p.getMethod().getDisplayName(),
                    p.getOutsourcingBasis(), p.getOutsourcingBasis().getDisplayName(),
                    p.isGenerated(), latest);
        }
    }

    /** 사전작업 · 원가계산 결과 — 몇 품목에 원가가 섰나. */
    public record CostRunResult(int months, int rows) {}

    /** [수량비교] 재고수량 Checklist 한 줄 — 장부 기초수량 · 월별원가 기초수량 · 차이(= 장부 − 월별원가). 없으면 null. */
    public record QtyCompareRow(String itemCode, String itemName, String spec,
                                BigDecimal bookQty, BigDecimal costQty, BigDecimal diff) {}

    /** [전월금액비교] 금액비교 Checklist 한 줄 — 지금 전월 구매 · 원가 계산 때 구매 · 차이(= 지금 − 그때). */
    public record AmountCompareRow(String itemCode, String itemName, String spec,
                                   BigDecimal nowQty, BigDecimal nowAmount,
                                   BigDecimal costQty, BigDecimal costAmount,
                                   BigDecimal qtyDiff, BigDecimal amountDiff) {}

    /** [이력] 한 줄 — 품목 · 작업자 · 수정시간 · 최종상태. */
    public record HistoryRow(String itemCode, String itemName, String calcBy,
                             java.time.LocalDateTime calcAt, String status) {}

    /** Checklist 머리의 기간(원본 '2026/10 ~ 2026/10') 과 줄. */
    public record Checklist<T>(String fromMonth, String toMonth, List<T> rows) {}
}
