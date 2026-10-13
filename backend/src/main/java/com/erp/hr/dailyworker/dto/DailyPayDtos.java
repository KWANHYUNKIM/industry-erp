package com.erp.hr.dailyworker.dto;

import com.erp.hr.dailyworker.DailyPayLine;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

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
            long workConfirmCount, int headcount, BigDecimal grossTotal, long directAmountCount
    ) {}

    /** 근무기록확정 창 한 줄 — 원본 사원번호 · 사원명 · 최종근무일 · 부서명 · 일근무 · 근로일수. */
    public record ConfirmRow(
            Long workerId, String workerCode, String workerName, LocalDate lastWorkDate, String department, BigDecimal days,
            BigDecimal amount, BigDecimal workDays
    ) {}

    public record ConfirmCell(@NotNull(message = "사원을 선택 바랍니다.") Long workerId,
                              @PositiveOrZero(message = "일근무는 0 이상이어야 합니다.") BigDecimal days,
                              @PositiveOrZero(message = "근로일수는 0 이상이어야 합니다.") BigDecimal workDays) {}

    public record CalculateResponse(int calculated, int skipped) {}

    /** [전체계산] · [개인별계산] — workerIds 가 비면 전체. 원본 확인 창의 '지급총액 0 이하 제외'(처음 켬). */
    public record CalculateRequest(List<Long> workerIds, Boolean excludeNonPositive) {}

    /** 금액직접입력 목록 한 줄 — 사원마다 손으로 정한 수당총액 · 공제총액. */
    public record DirectSummary(Long workerId, BigDecimal allowanceTotal, BigDecimal deductionTotal) {}

    /** 수당/공제 항목입력 — 일근무 금액 · 메모, 기타 상단메세지 · 하단메세지. */
    public record DirectAmountResponse(Long workerId, BigDecimal dayAmount, String memo, String topMessage, String bottomMessage) {}

    public record DirectAmountRequest(
            @PositiveOrZero(message = "금액은 0 이상이어야 합니다.") BigDecimal dayAmount,
            @Size(max = 200, message = "입력한 글자가 너무 깁니다. 200자까지 넣을 수 있습니다.") String memo,
            @Size(max = 200, message = "입력한 글자가 너무 깁니다. 200자까지 넣을 수 있습니다.") String topMessage,
            @Size(max = 200, message = "입력한 글자가 너무 깁니다. 200자까지 넣을 수 있습니다.") String bottomMessage
    ) {}

    /** 급여대장 [일괄수정] 한 줄 — 총근무일수 · 일근무(일수 · 금액) · 소득세 · 지방소득세. 실지급액은 서버가 합으로 다시 맞춘다. */
    public record LineEdit(
            @NotNull(message = "급여 줄을 선택 바랍니다.") Long lineId,
            @NotNull(message = "일근무를 입력 바랍니다.") @PositiveOrZero(message = "일근무는 0 이상이어야 합니다.") BigDecimal days,
            @NotNull(message = "금액을 입력 바랍니다.") @PositiveOrZero(message = "금액은 0 이상이어야 합니다.") BigDecimal grossPay,
            @NotNull(message = "소득세를 입력 바랍니다.") @PositiveOrZero(message = "소득세는 0 이상이어야 합니다.") BigDecimal incomeTax,
            @NotNull(message = "지방소득세를 입력 바랍니다.") @PositiveOrZero(message = "지방소득세는 0 이상이어야 합니다.") BigDecimal localTax
    ) {}

    public record LineResponse(
            Long id, Long workerId, String workerCode, String workerName, BigDecimal days, BigDecimal dailyWage,
            BigDecimal grossPay, BigDecimal incomeTax, BigDecimal localTax, BigDecimal netPay, boolean direct
    ) {
        /** direct — 금액직접입력으로 정한 일근무(원본 급여대장 칸 모서리의 붉은 표시). */
        public static LineResponse from(DailyPayLine l, boolean direct) {
            return new LineResponse(l.getId(), l.getWorker().getId(), l.getWorker().getCode(), l.getWorker().getName(),
                    l.getDays(), l.getWorker().getDailyWage(), l.getGrossPay(), l.getIncomeTax(), l.getLocalTax(), l.getNetPay(), direct);
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
