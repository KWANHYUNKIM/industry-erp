package com.erp.dto;

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
            List<WithholdingRow> rows
    ) {}

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
