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
            long headcount, BigDecimal grossTotal, long confirmedCount,
            /* 원본 [사전작업] '근무기록확정[n]' 의 n — 근무기록을 확정한 사원 수 */
            long workConfirmCount,
            /* 원본 [사전작업] '금액직접입력[n]' 의 n — 금액을 손으로 정한 사원 수 */
            long directAmountCount
    ) {}

    /**
     * 원본 [개인별계산] · [전체계산] 확인 창 — employeeIds 가 비면 전체계산(재직 사원 모두),
     * 있으면 그 사원들만 지우고 다시 셈한다. excludeNonPositive 는 확인 창의 '지급총액 0 이하 제외'(처음 켬).
     */
    public record CalculateRequest(java.util.List<Long> employeeIds, Boolean excludeNonPositive) {}

    /** [전체계산] 결과 — 원본처럼 지급총액 0 이하는 빼고 센다. */
    public record CalculateResult(int calculated, int skipped, String failures) {}

    /** [금액직접입력] '수당/공제 항목입력' 칸 하나 — 이름은 명세 줄 이름(기본급 · 지방소득세 …). 빈 칸은 보내지 않는다. */
    public record DirectAmountCell(
            @jakarta.validation.constraints.NotNull(message = "수당·공제 구분을 고르세요.") com.erp.hr.payroll.PayslipLineKind kind,
            @NotBlank(message = "항목명을 입력하세요.") @Size(max = 100, message = "항목명은 100자까지 넣을 수 있습니다.") String itemName,
            @jakarta.validation.constraints.NotNull(message = "금액을 입력하세요.") @jakarta.validation.constraints.PositiveOrZero(message = "금액은 0 이상이어야 합니다.") BigDecimal amount,
            @Size(max = 200, message = "메모는 200자까지 넣을 수 있습니다.") String memo
    ) {}

    /** [금액직접입력] [저장(F8)] — 그 사원의 칸을 통째로 바꾼다. */
    public record DirectAmountRequest(@jakarta.validation.Valid java.util.List<DirectAmountCell> cells) {}

    /** [금액직접입력] 목록 한 줄 — 사원마다 손으로 정한 수당총액 · 공제총액(기본급은 수당으로 센다). */
    public record DirectAmountSummary(Long employeeId, BigDecimal allowanceTotal, BigDecimal deductionTotal) {}
}
