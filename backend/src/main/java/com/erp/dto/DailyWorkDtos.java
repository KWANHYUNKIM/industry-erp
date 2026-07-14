package com.erp.dto;

import com.erp.domain.DailyWorkRecord;
import jakarta.validation.constraints.NotNull;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

public class DailyWorkDtos {

    public record CreateDailyWorkRequest(
            @NotNull(message = "사원을 선택하세요.") Long employeeId,
            @NotNull(message = "근무일을 입력하세요.") LocalDate workDate,
            @NotNull(message = "일당을 입력하세요.") BigDecimal dailyWage,
            Integer workHours,
            String remark
    ) {}

    /** 지급 처리. 지급일을 비우면 오늘로 본다. */
    public record PayRequest(List<Long> ids, LocalDate paidDate) {}

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
            String createdBy
    ) {
        public static DailyWorkResponse from(DailyWorkRecord r) {
            return new DailyWorkResponse(
                    r.getId(),
                    r.getEmployee().getId(), r.getEmployee().getCode(), r.getEmployee().getName(),
                    r.getEmployee().getDepartment() != null ? r.getEmployee().getDepartment().getName() : "",
                    r.getWorkDate(), r.getWorkHours(), r.getDailyWage(),
                    r.getIncomeTax(), r.getLocalIncomeTax(), r.getNetPay(),
                    r.isPaid(), r.getPaidDate(), r.getRemark(), r.getCreatedBy());
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
