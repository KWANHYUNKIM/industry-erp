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
            Boolean includeYearEnd,
            /** 원본 [소득자료반영기준] ○직접지정 */
            Boolean directIncome,
            /** 직접지정의 [급여대장] 에서 고른 대장 id */
            @Size(max = 50, message = "급여대장은 50개까지 고를 수 있습니다.") List<Long> payLedgerIds
    ) {}

    /** 원천징수이행상황신고서 목록 한 줄 — 원본 열: 귀속연월 · 신고구분(연말정산) · 지급연월 · 신고일자 · 회사명 · 사업자등록번호. */
    public record WithholdingReturnResponse(
            Long id,
            WithholdingFilingType filingType, String filingTypeName,
            WithholdingFilingMethod filingMethod, String filingMethodName,
            String attributionMonth, String payMonth, LocalDate reportDate,
            boolean includeYearEnd,
            String companyName, String bizRegNo,
            boolean directIncome, List<Long> payLedgerIds
    ) {
        public static WithholdingReturnResponse from(WithholdingReturn r, CompanyInfoResponse company) {
            return new WithholdingReturnResponse(
                    r.getId(),
                    r.getFilingType(), r.getFilingType().getDisplayName(),
                    r.getFilingMethod(), r.getFilingMethod().getDisplayName(),
                    r.getAttributionMonth(), r.getPayMonth(), r.getReportDate(),
                    r.isIncludeYearEnd(),
                    company == null ? null : company.name(),
                    company == null ? null : company.bizRegNo(),
                    r.isDirectIncome(), r.ledgerIds());
        }
    }

    /** 원본 '원천징수이행상황신고서 이력' 한 줄 — 순번 · 작업자ID · 작업일시 · 신고서종류 · 상태. */
    public record ReturnHistoryRow(int seq, String changedBy, java.time.LocalDateTime changedAt, String kind, String action) {}

    /** 원천징수부 — 지급연월 한 줄. 총급여는 과세분(기본급 + 과세 수당)이고 비과세 수당은 따로 든다(원본 Ⅰ · Ⅱ쪽). */
    public record LedgerMonth(
            String payMonth,
            BigDecimal taxablePay,
            BigDecimal nonTaxablePay,
            BigDecimal incomeTax,
            BigDecimal localIncomeTax,
            /** (31) 급여구간 — 간이세액표 구간 '4,240,000~4,260,000'. 표 밖이면 null. */
            String payBracket
    ) {}

    /** 원천징수부 — 소득자 한 사람의 귀속연도(기준연월까지) 근로소득 지급명세. */
    public record LedgerEmployee(
            Long employeeId, String employeeCode, String employeeName,
            LocalDate hireDate, LocalDate resignDate,
            List<LedgerMonth> months
    ) {}

    /**
     * 법인세Checklist [3. 급여 및 원천세 내역] 한 달 — 원천세 신고금액(그 달을 귀속으로 낸 신고서의 근로소득 총지급액,
     * 신고서가 없으면 0)과 급여대장(그 달 급여명세 전부) 합계.
     */
    public record PayrollTaxMonth(
            String month, BigDecimal reported,
            BigDecimal salary, BigDecimal bonus, BigDecimal incomeTax, BigDecimal localIncomeTax,
            BigDecimal pension, BigDecimal health, BigDecimal employment
    ) {}

    /**
     * 소득자료제출집계표 한 줄 — 매수(지급조서 장수) · 건수(명세 줄) · 소득(수입)금액 · 소득세 · 법인세 · 농어촌특별세 · 지방소득세.
     * kind = [출력구분], label = 서식의 ⑨ 소득종류(연말정산 · 중도정산 → 근로소득, 비거주자사업소득 → 사업기타소득 (비거주자)).
     * corporateTax — 소득자가 법인인 줄의 세액. 원본은 그 세액을 ⑬ 소득세가 아니라 ⑭ 법인세 칸에 찍는다.
     */
    public record IncomeSubmission(String kind, String label, int pages, int count, BigDecimal income,
                                   BigDecimal incomeTax, BigDecimal corporateTax, BigDecimal ruralTax,
                                   BigDecimal localIncomeTax) {}

    /** 원천징수영수증(일용직) 한 사원 — 원본 목록 [사원번호 · 사원명 · 총지급액 · 비과세총액 · 소득세 · 지방소득세] + 근무일수 · 최종근무일. */
    public record DailyReceipt(Long employeeId, String employeeCode, String employeeName, BigDecimal days, LocalDate lastDate,
                               BigDecimal totalPay, BigDecimal nonTaxable, BigDecimal incomeTax, BigDecimal localIncomeTax) {}

    /**
     * 원천세신고자료비교표 한 줄(기준월 × 구분) — 급여대장(자료) 쪽 인원 · 지급총액 · 비과세 · 소득세 · 지방소득세와
     * 그 달 신고서의 인원 · 금액 · 소득세. 신고서가 없으면 신고 칸은 null. month 가 null 이면 합계 줄.
     */
    public record ComparisonRow(String month, String kind, int count, BigDecimal gross, BigDecimal nonTaxable,
                                BigDecimal incomeTax, BigDecimal localIncomeTax,
                                Integer reportedCount, BigDecimal reportedGross, BigDecimal reportedTax, boolean differs) {}

    /**
     * 원본 신고서 [신규] › 소득자료반영기준 ○직접지정 › [급여대장] '급여대장검색' 한 줄(2026-10-13 loginaa 실측).
     * 열: 귀속연월(2026/10-1) · 지급연월 · 구분 · 급여대장명칭 · 인원 · 급여대장금액 · 신고대상금액 · 상세내역 · 반영여부.
     * 신고대상금액 = 급여대장금액 − <b>제출제외 비과세</b>(차량유지비) — 원본 21,669,000 − 1,200,000 = 20,469,000.
     * 식대 같은 제출대상 비과세는 빼지 않는다(신고서 A01 총지급액에 들어간다).
     */
    public record LedgerPick(Long id, String code, String payMonth, String kind, String name,
                             int headcount, BigDecimal ledgerAmount, BigDecimal reportAmount) {}

    /**
     * 원본 '간이소득내역' 창 한 줄(급여대장검색의 [상세내역] 조회) — 사원번호 · 성명 · 입사일 · 퇴사일 · 급여대장금액 ·
     * 제출제외 비과세 · 제출대상 비과세 및 감면 · 제출대상 금액 · 소득세.
     */
    public record SimpleIncomeRow(String employeeCode, String employeeName, LocalDate hireDate, LocalDate resignDate,
                                  BigDecimal ledgerAmount, BigDecimal excludedNonTaxable, BigDecimal submittedNonTaxable,
                                  BigDecimal submitAmount, BigDecimal incomeTax) {}
}
