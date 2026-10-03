package com.erp.accounting.withholding.dto;

import com.erp.accounting.withholding.WithholdingFilingMethod;
import com.erp.accounting.withholding.WithholdingFilingType;
import com.erp.accounting.withholding.WithholdingReturn;
import com.erp.settings.companyinfo.dto.CompanyInfoDtos.CompanyInfoResponse;

import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.time.LocalDate;
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

    /** 원천징수이행상황신고서 만들기 · 고치기. 고칠 때는 filingType · reportDate 만 반영된다. */
    public record WithholdingReturnRequest(
            WithholdingFilingType filingType,
            WithholdingFilingMethod filingMethod,
            @Size(max = 7) String attributionMonth,
            @Size(max = 7) String payMonth,
            LocalDate reportDate,
            Boolean includeYearEnd
    ) {}

    /** 원천징수이행상황신고서 목록 한 줄 — 원본 열: 귀속연월 · 신고구분(연말정산) · 지급연월 · 신고일자 · 회사명 · 사업자등록번호. */
    public record WithholdingReturnResponse(
            Long id,
            WithholdingFilingType filingType, String filingTypeName,
            WithholdingFilingMethod filingMethod, String filingMethodName,
            String attributionMonth, String payMonth, LocalDate reportDate,
            boolean includeYearEnd,
            String companyName, String bizRegNo
    ) {
        public static WithholdingReturnResponse from(WithholdingReturn r, CompanyInfoResponse company) {
            return new WithholdingReturnResponse(
                    r.getId(),
                    r.getFilingType(), r.getFilingType().getDisplayName(),
                    r.getFilingMethod(), r.getFilingMethod().getDisplayName(),
                    r.getAttributionMonth(), r.getPayMonth(), r.getReportDate(),
                    r.isIncludeYearEnd(),
                    company == null ? null : company.name(),
                    company == null ? null : company.bizRegNo());
        }
    }
}
