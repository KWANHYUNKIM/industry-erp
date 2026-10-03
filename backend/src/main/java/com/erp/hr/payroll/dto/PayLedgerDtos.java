package com.erp.hr.payroll.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.time.LocalDate;

public class PayLedgerDtos {

    /** 원본 '급여정보입력' 창 — 귀속연월 · 지급일 · 급여대장명칭. */
    public record CreateLedgerRequest(
            @NotBlank(message = "귀속연월을 입력 바랍니다.")
            @Pattern(regexp = "\\d{4}-\\d{2}", message = "귀속연월은 YYYY-MM 입니다.") String payMonth,
            LocalDate payDate,
            @Size(max = 100, message = "급여대장명칭은 100자까지 넣을 수 있습니다.") String name
    ) {}

    /** 대장 목록 한 줄. 인원수 · 지급총액은 그 귀속월 급여명세를 센다(계산 전이면 0). */
    public record LedgerResponse(
            Long id, String payMonth, String name, LocalDate payDate,
            long headcount, BigDecimal grossTotal, long confirmedCount
    ) {}

    /** [전체계산] 결과 — 원본처럼 지급총액 0 이하는 빼고 센다. */
    public record CalculateResult(int calculated, int skipped, String failures) {}
}
