package com.erp.dto;

import java.math.BigDecimal;
import java.util.List;

public final class AccountingDtos {

    private AccountingDtos() {}

    /** 매입매출·부가세 요약 (부가세 신고 기초) */
    public record VatSummaryResponse(
            BigDecimal salesSupply,     // 매출 공급가액
            BigDecimal salesVat,        // 매출 부가세(매출세액)
            BigDecimal salesTotal,      // 매출 합계
            BigDecimal purchaseSupply,  // 매입 공급가액
            BigDecimal purchaseVat,     // 매입 부가세(매입세액)
            BigDecimal purchaseTotal,   // 매입 합계
            BigDecimal vatPayable       // 납부(환급)세액 = 매출세액 - 매입세액
    ) {}

    /** 품목별 원가·이익 (원가법: 총평균 매입 / 제조원가는 BOM 기반) */
    public record ItemProfitResponse(
            Long itemId,
            String code,
            String name,
            String costBasis,          // 원가 산정근거 (매입평균/제조원가/기준단가)
            BigDecimal soldQty,        // 판매수량
            BigDecimal salesAmount,    // 매출액(공급가)
            BigDecimal unitCost,       // 원가단가
            BigDecimal costAmount,     // 매출원가 = 판매수량 x 원가단가
            BigDecimal profit,         // 매출이익 = 매출액 - 매출원가
            BigDecimal marginRate      // 이익률(%)
    ) {}

    /** 손익 요약 */
    public record ProfitSummaryResponse(
            BigDecimal totalSales,     // 총매출액(공급가)
            BigDecimal totalCost,      // 총매출원가
            BigDecimal grossProfit,    // 매출총이익
            BigDecimal marginRate      // 매출총이익률(%)
    ) {}

    /** 월별 이익현황 (매출 - 매입) */
    public record MonthlyProfitResponse(
            String month,              // yyyy-MM
            BigDecimal revenue,        // 매출액(공급가 합계)
            BigDecimal cost,           // 매입액(공급가 합계)
            BigDecimal profit,         // 이익 = 매출 - 매입
            BigDecimal marginRate      // 이익률(%)
    ) {}

    /** 일별 이익현황 (매출 - 매입) */
    public record DailyProfitResponse(
            String date,               // yyyy-MM-dd
            BigDecimal revenue,
            BigDecimal cost,
            BigDecimal profit,
            BigDecimal marginRate
    ) {}
}
