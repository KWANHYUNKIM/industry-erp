package com.erp.hr.dailywork.dto;

import com.erp.hr.dailywork.DailyWorkRecord;
import jakarta.validation.constraints.Size;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.NotNull;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

public class DailyWorkDtos {

    public record CreateDailyWorkRequest(
            @NotNull(message = "사원을 선택하세요.") Long employeeId,
            @NotNull(message = "근무일을 입력하세요.") LocalDate workDate,
            @NotNull(message = "일당을 입력하세요.") BigDecimal dailyWage,
            @PositiveOrZero(message = "근무시간은 0~24 입니다.")
            @Max(value = 24, message = "근무시간은 0~24 입니다.") Integer workHours,
            @Size(max = 500, message = "입력한 글자가 너무 깁니다. 500자까지 넣을 수 있습니다.")
            String remark
    ) {}

    /** 지급 처리. 지급일을 비우면 오늘로 본다. */
    /** bankAccountId 가 없으면 현금 지급으로 분개한다. */
    public record PayRequest(List<Long> ids, LocalDate paidDate, Long bankAccountId) {}

    public record DailyWorkResponse(
            Long id,
            Long employeeId,
            String employeeCode,
            String employeeName,
            String department,
            LocalDate workDate,
            int workHours,
            BigDecimal dailyWage,
            BigDecimal incomeTax,
            BigDecimal localIncomeTax,
            BigDecimal netPay,
            boolean paid,
            LocalDate paidDate,
            String remark,
            String createdBy,
            /** 지급하며 만든 회계전표 번호(QA 69회차). 미지급이면 null. */
            String journalNo
    ) {
        public static DailyWorkResponse from(DailyWorkRecord r) {
            return new DailyWorkResponse(
                    r.getId(),
                    r.getEmployee().getId(), r.getEmployee().getCode(), r.getEmployee().getName(),
                    r.getEmployee().getDepartment() != null ? r.getEmployee().getDepartment().getName() : "",
                    r.getWorkDate(), r.getWorkHours(), r.getDailyWage(),
                    r.getIncomeTax(), r.getLocalIncomeTax(), r.getNetPay(),
                    r.isPaid(), r.getPaidDate(), r.getRemark(), r.getCreatedBy(),
                    r.getJournalEntry() != null ? r.getJournalEntry().getDocNo() : null);
        }
    }

    /** 월별 일용직 급여대장 요약 */
    public record DailyWorkSummary(
            String month,
            int headcount,
            int workDays,
            BigDecimal totalWage,
            BigDecimal totalIncomeTax,
            BigDecimal totalLocalIncomeTax,
            BigDecimal totalNetPay,
            BigDecimal unpaidNetPay,
            List<DailyWorkResponse> rows
    ) {}
}
