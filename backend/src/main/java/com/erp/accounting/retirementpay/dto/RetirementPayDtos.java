package com.erp.accounting.retirementpay.dto;

import com.erp.accounting.retirementpay.RetirementPay;
import com.erp.accounting.retirementpay.RetirementTaxCalculator;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

public final class RetirementPayDtos {

    private RetirementPayDtos() {}

    /**
     * 계산 · 저장 요청. retirementPay 를 비우면 평균임금으로 퇴직산출액을 낸다(원본 [퇴직금재계산]),
     * 넣으면 그 값으로 세금만 다시 센다(원본 '(15)퇴직급여 최종란에 금액 입력 후 Enter').
     */
    public record RetirementPayRequest(
            Long employeeId,
            @Size(max = 7) String withholdingMonth,
            LocalDate payDate,
            LocalDate startDate,
            LocalDate retireDate,
            @Size(max = 50) String retireReason,
            Boolean executive,
            BigDecimal extraPay,
            BigDecimal retirementPay,
            BigDecimal nonTaxable
    ) {}

    /** 퇴직급여 계산내역의 달 한 줄(급여 · 상여). */
    public record MonthAmount(String month, BigDecimal amount) {}

    /** 원본 [퇴직급여 계산내역] ⓐ ~ ⓘ 와 서식 (28) ~ (34). */
    public record Calculation(
            String wageFrom, String wageTo, List<MonthAmount> wages, BigDecimal wage3m,
            String bonusFrom, String bonusTo, List<MonthAmount> bonuses, BigDecimal bonus1y, BigDecimal bonus3m,
            BigDecimal extraPay, BigDecimal total3m, int workDays3m, BigDecimal dailyWage, int serviceDays,
            BigDecimal computedPay,
            int serviceMonths, int serviceYears,
            BigDecimal retirementPay, BigDecimal nonTaxable,
            RetirementTaxCalculator.Tax tax
    ) {}

    /** 목록 한 줄 — 원본 열: 퇴직일자(귀속) · 원천징수연월 · 사번 · 성명 · 부서 · 입사일자 · 기산일 · 퇴사일 · 지급일 · 퇴직금 · 소득세 · 지방소득세 · 농어촌특별세 · 공제총액 · 실지급액. */
    public record RetirementPayResponse(
            Long id, Long employeeId, String employeeCode, String employeeName, String department,
            LocalDate hireDate, LocalDate startDate, LocalDate retireDate, LocalDate payDate,
            String withholdingMonth, String retireReason, boolean executive,
            BigDecimal extraPay, BigDecimal retirementPay, BigDecimal nonTaxable,
            BigDecimal incomeTax, BigDecimal localIncomeTax, BigDecimal deductionTotal, BigDecimal netPay
    ) {
        public static RetirementPayResponse from(RetirementPay r) {
            var e = r.getEmployee();
            BigDecimal deduction = r.getIncomeTax().add(r.getLocalIncomeTax());
            return new RetirementPayResponse(r.getId(), e.getId(), e.getCode(), e.getName(),
                    e.getDepartment() != null ? e.getDepartment().getName() : "",
                    e.getHireDate(), r.getStartDate(), r.getRetireDate(), r.getPayDate(),
                    r.getWithholdingMonth(), r.getRetireReason(), r.isExecutive(),
                    r.getExtraPay(), r.getRetirementPay(), r.getNonTaxable(),
                    r.getIncomeTax(), r.getLocalIncomeTax(), deduction, r.getRetirementPay().subtract(deduction));
        }
    }

    /**
     * 퇴직급여추계액(E030108) 한 사원 — 정산시작일 · 3개월 급여 · 1년 상여(3개월로 환산) · 근속 년/월/일 · 3개월 근무일수 ·
     * 재직일수 · 퇴직급여(1일 평균임금 소수 둘째 자리 반올림 × 30 × 재직일수 ÷ 365, 원 단위 반올림).
     */
    public record EstimateRow(Long employeeId, String employeeCode, String employeeName, LocalDate startDate,
                              BigDecimal threeMonthPay, BigDecimal bonusThreeMonths, int years, int months, int days,
                              int threeMonthDays, long serviceDays, BigDecimal retirementPay) {}
}
