package com.erp.hr.dto;

import com.erp.hr.domain.EmploymentContract;
import com.erp.hr.domain.enums.ContractStatus;
import com.erp.hr.domain.enums.ContractType;
import jakarta.validation.constraints.Size;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.NotNull;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

public class EmploymentContractDtos {

    public record CreateContractRequest(
            @NotNull(message = "사원을 선택하세요.") Long employeeId,
            @NotNull(message = "계약 유형을 선택하세요.") ContractType type,
            @NotNull(message = "계약 시작일을 입력하세요.") LocalDate startDate,
            LocalDate endDate,
            Long departmentId,
            @Size(max = 100, message = "입력한 글자가 너무 깁니다. 100자까지 넣을 수 있습니다.")
            String jobTitle,
            BigDecimal monthlySalary,
            @PositiveOrZero(message = "주 소정근로시간은 0~168 입니다.")
            @Max(value = 168, message = "주 소정근로시간은 0~168 입니다.") Integer weeklyHours,
            @Size(max = 200, message = "입력한 글자가 너무 깁니다. 200자까지 넣을 수 있습니다.")
            String workPlace,
            @Size(max = 200, message = "입력한 글자가 너무 깁니다. 200자까지 넣을 수 있습니다.")
            String duty,
            @Size(max = 500, message = "입력한 글자가 너무 깁니다. 500자까지 넣을 수 있습니다.")
            String remark
    ) {}

    /** 서명. 사원 본인 확인용 서명자명을 남긴다. */
    public record SignContractRequest(
            @NotNull(message = "서명자명을 입력하세요.") String signedBy
    ) {}

    public record ContractResponse(
            Long id,
            String contractNo,
            Long employeeId,
            String employeeCode,
            String employeeName,
            ContractType type,
            String typeName,
            ContractStatus status,
            String statusName,
            LocalDate startDate,
            LocalDate endDate,
            Long departmentId,
            String department,
            String jobTitle,
            BigDecimal monthlySalary,
            int weeklyHours,
            String workPlace,
            String duty,
            LocalDateTime signedAt,
            String signedBy,
            String remark,
            String createdBy
    ) {
        public static ContractResponse from(EmploymentContract c) {
            return new ContractResponse(
                    c.getId(), c.getContractNo(),
                    c.getEmployee().getId(), c.getEmployee().getCode(), c.getEmployee().getName(),
                    c.getType(), c.getType().getDisplayName(),
                    c.getStatus(), c.getStatus().getDisplayName(),
                    c.getStartDate(), c.getEndDate(),
                    c.getDepartment() != null ? c.getDepartment().getId() : null,
                    c.getDepartment() != null ? c.getDepartment().getName() : "",
                    c.getJobTitle() != null ? c.getJobTitle() : "",
                    c.getMonthlySalary(), c.getWeeklyHours(),
                    c.getWorkPlace(), c.getDuty(),
                    c.getSignedAt(), c.getSignedBy(),
                    c.getRemark(), c.getCreatedBy());
        }
    }
}
