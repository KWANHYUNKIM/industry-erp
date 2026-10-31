package com.erp.accounting.cost.cost.dto;

import com.erp.accounting.cost.cost.CostMethod;
import com.erp.accounting.cost.cost.CostPeriod;
import com.erp.accounting.cost.cost.OutsourcingBasis;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.PositiveOrZero;
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

    /**
     * 원가계산내역 한 줄(원본 E040802 2026-10-13 실측 열) — 품목코드 · 품목명[규격] · 품목구분 · 생산공정명 ·
     * 기초 · 증가 · 감소 · 기말의 수량과 금액. 단가는 화면이 금액 ÷ 수량을 버림해 찍는다. 금액이 null 이면 '자동계산'.
     */
    public record LedgerRow(Long itemId, String itemCode, String itemName, String spec, String category, String processName,
                            BigDecimal openingQty, BigDecimal openingAmount,
                            BigDecimal increaseQty, BigDecimal increaseAmount,
                            BigDecimal decreaseQty, BigDecimal decreaseAmount,
                            BigDecimal closingQty, BigDecimal closingAmount) {}

    /** 원가계산내역 머리의 기간과 줄. */
    public record Ledger(String fromMonth, String toMonth, List<LedgerRow> rows) {}

    /** 체크 → [변경] 원가수정 창 — 기초 · 증가 여섯 줄 · 감소 · 기말. */
    public record LedgerDetail(Long itemId, String itemCode, String itemName,
                               BigDecimal openingQty, BigDecimal openingAmount,
                               BigDecimal purchaseQty, BigDecimal purchaseAmount,
                               BigDecimal productionQty, BigDecimal productionAmount,
                               BigDecimal laborAmount, BigDecimal overheadAmount,
                               BigDecimal outsourcingQty, BigDecimal outsourcingAmount,
                               BigDecimal adjustQty, BigDecimal adjustAmount,
                               BigDecimal decreaseQty, BigDecimal decreaseAmount,
                               BigDecimal closingQty, BigDecimal closingAmount) {}

    /**
     * 원가수정 [저장(F8)] — 원본에서 흰 칸(고칠 수 있는 칸)만: 기초 수량 · 단가, 생산입고 단가, 노무비 · 경비 금액,
     * 외주비 단가, 조정/대체/반품 단가. 나머지(구매 · 수량들 · 감소 · 기말)는 장부와 계산이 정한다.
     */
    public record UpdateLedgerRequest(
            BigDecimal openingQty,
            @PositiveOrZero(message = "단가는 0 이상이어야 합니다.") BigDecimal openingPrice,
            @PositiveOrZero(message = "단가는 0 이상이어야 합니다.") BigDecimal productionPrice,
            @PositiveOrZero(message = "노무비는 0 이상이어야 합니다.") BigDecimal laborAmount,
            @PositiveOrZero(message = "경비는 0 이상이어야 합니다.") BigDecimal overheadAmount,
            @PositiveOrZero(message = "단가는 0 이상이어야 합니다.") BigDecimal outsourcingPrice,
            @PositiveOrZero(message = "단가는 0 이상이어야 합니다.") BigDecimal adjustPrice) {}
}
