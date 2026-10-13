package com.erp.hr.payroll.dto;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;

import java.math.BigDecimal;

/** 공제항목등록 Option › 세율/세액등록 — 연도별 4대보험 근로자 부담 요율(율은 소수: 0.045 = 4.5 %). */
public final class InsuranceRateDtos {

    private InsuranceRateDtos() {}

    /** custom = 회사가 그 해 줄을 정했나(false 면 법정 요율을 보여 준다). */
    public record InsuranceRateResponse(
            int year,
            boolean custom,
            BigDecimal pensionRate,
            BigDecimal healthRate,
            BigDecimal longTermCareRate,
            BigDecimal employmentRate
    ) {}

    public record InsuranceRateRequest(
            @NotNull(message = "국민연금 요율을 입력 바랍니다.") @PositiveOrZero @DecimalMax("1") BigDecimal pensionRate,
            @NotNull(message = "건강보험 요율을 입력 바랍니다.") @PositiveOrZero @DecimalMax("1") BigDecimal healthRate,
            @NotNull(message = "장기요양 요율을 입력 바랍니다.") @PositiveOrZero @DecimalMax("1") BigDecimal longTermCareRate,
            @NotNull(message = "고용보험 요율을 입력 바랍니다.") @PositiveOrZero @DecimalMax("1") BigDecimal employmentRate
    ) {}
}
