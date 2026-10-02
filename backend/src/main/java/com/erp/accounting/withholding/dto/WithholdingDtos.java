package com.erp.accounting.withholding.dto;

import java.math.BigDecimal;
import java.util.List;

public final class WithholdingDtos {

    private WithholdingDtos() {}

    /** 원천징수이행상황신고서 — 사원 한 줄 */
    public record WithholdingRow(
            Long payslipId,
            Long employeeId, String employeeCode, String employeeName,
            BigDecimal grossPay,
            BigDecimal incomeTax,
            BigDecimal localIncomeTax,
            BigDecimal totalWithheld
    ) {}

    /**
     * 원천징수이행상황신고서 (월별).
     * 신고 대상은 확정된 급여명세뿐이다. 미확정분은 draftCount 로만 알린다.
     */
    public record WithholdingStatement(
            String payMonth,
            int headcount,
            int draftCount,
            BigDecimal totalGrossPay,
            BigDecimal totalIncomeTax,
            BigDecimal totalLocalIncomeTax,
            BigDecimal totalWithheld,
            List<WithholdingRow> rows,
            /**
             * 소득 구분별 줄 — 원본 신고서의 [근로소득 간이세액(A01)] · [일용근로(A03)] · 사업·기타·이자·배당.
             * 위 total* 은 근로소득(급여명세)만이다. <b>납부할 세액은 grand*</b> 다(QA 68회차 — 일용·기타가 빠져 덜 신고됐다).
             */
            List<IncomeSection> sections,
            BigDecimal grandIncomeTax,
            BigDecimal grandLocalIncomeTax,
            BigDecimal grandWithheld
    ) {}

    /** 소득 구분 한 줄: 인원(건수) · 지급액 · 소득세 · 지방소득세. */
    public record IncomeSection(String code, String name, int count, BigDecimal grossPay,
                                BigDecimal incomeTax, BigDecimal localIncomeTax) {}

    /** 근로소득 원천징수영수증 — 월별 내역 한 줄 */
    public record ReceiptMonth(
            String payMonth,
            BigDecimal grossPay,
            BigDecimal incomeTax,
            BigDecimal localIncomeTax
    ) {}

    /** 근로소득 원천징수영수증 (연간, 사원별) */
    public record WithholdingReceipt(
            int year,
            Long employeeId, String employeeCode, String employeeName,
            BigDecimal grossPay,
            BigDecimal incomeTax,
            BigDecimal localIncomeTax,
            BigDecimal totalWithheld,
            BigDecimal socialInsurance,
            List<ReceiptMonth> months
    ) {}
}
