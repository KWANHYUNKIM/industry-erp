package com.erp.hr.dailyworker.dto;

import com.erp.hr.dailyworker.DailyPayLine;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.time.LocalDate;

public class DailyPayDtos {

    /** 원본 '급여정보입력' — 귀속연월 · 대상기간 · 지급일 · 지급연월 · 급여대장명칭. 비우면 기본값. */
    public record CreateLedgerRequest(
            @NotBlank(message = "귀속연월을 입력 바랍니다.")
            @Pattern(regexp = "\\d{4}-\\d{2}", message = "귀속연월은 YYYY-MM 꼴이어야 합니다.") String payMonth,
            LocalDate periodFrom,
            LocalDate periodTo,
            LocalDate payDate,
            @Pattern(regexp = "\\d{4}-\\d{2}", message = "지급연월은 YYYY-MM 꼴이어야 합니다.") String paidMonth,
            @Size(max = 100, message = "입력한 글자가 너무 깁니다. 100자까지 넣을 수 있습니다.") String name
    ) {}

    public record LedgerResponse(
            Long id, String payMonth, int seq, String name, String paidMonth, LocalDate payDate,
            LocalDate periodFrom, LocalDate periodTo, boolean confirmed,
            long workConfirmCount, int headcount, BigDecimal grossTotal
    ) {}

    /** 근무기록확정 창 한 줄 — 원본 사원번호 · 사원명 · 최종근무일 · 부서명 · 일근무 · 근로일수. */
    public record ConfirmRow(
            Long workerId, String workerCode, String workerName, LocalDate lastWorkDate, String department, BigDecimal days
    ) {}

    public record ConfirmCell(@NotNull(message = "사원을 선택 바랍니다.") Long workerId,
                              @PositiveOrZero(message = "일근무는 0 이상이어야 합니다.") BigDecimal days) {}

    public record CalculateResponse(int calculated, int skipped) {}

    public record LineResponse(
            Long id, Long workerId, String workerCode, String workerName, BigDecimal days, BigDecimal dailyWage,
            BigDecimal grossPay, BigDecimal incomeTax, BigDecimal localTax, BigDecimal netPay
    ) {
        public static LineResponse from(DailyPayLine l) {
            return new LineResponse(l.getId(), l.getWorker().getId(), l.getWorker().getCode(), l.getWorker().getName(),
                    l.getDays(), l.getWorker().getDailyWage(), l.getGrossPay(), l.getIncomeTax(), l.getLocalTax(), l.getNetPay());
        }
    }

    /** 사원별급여조회 · 급여현황 · 급여이체현황 한 줄 — 대장 · 사원 · 금액 · 급여통장. */
    public record ReportLine(
            Long lineId, Long ledgerId, String payMonth, int seq, String ledgerName, String paidMonth, LocalDate payDate,
            boolean confirmed, Long workerId, String workerCode, String workerName, String department,
            LocalDate lastWorkDate, BigDecimal days, BigDecimal grossPay, BigDecimal incomeTax, BigDecimal localTax,
            BigDecimal netPay, String bankName, String accountNo, String accountHolder
    ) {}

    /** 근무확정현황 한 줄 — 귀속연월-NO · 성명 · 수당항목명(일근무) · 근무기록. 지급연월 · 지급일 · 사원 · 부서는 조건으로 거른다. */
    public record ConfirmReportLine(String payMonth, int seq, String paidMonth, LocalDate payDate, Long workerId,
                                    String workerCode, String workerName, Long departmentId, String payItem, BigDecimal days) {}
}
