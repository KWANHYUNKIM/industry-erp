package com.erp.dto;

import com.erp.domain.Employee;
import jakarta.validation.constraints.NotNull;

import java.math.BigDecimal;

public class EmployeeDtos {

    public record UpdateSalaryRequest(
            @NotNull(message = "기본급을 입력하세요.") BigDecimal baseSalary
    ) {}

    /** 부서 배치. departmentId 가 null 이면 미배치로 되돌린다. */
    public record AssignDepartmentRequest(Long departmentId) {}

    public record EmployeeResponse(
            Long id,
            String code,
            String name,
            Long departmentId,
            String department,
            String jobTitle,
            BigDecimal baseSalary
    ) {
        public static EmployeeResponse from(Employee e) {
            return new EmployeeResponse(
                    e.getId(), e.getCode(), e.getName(),
                    e.getDepartment() != null ? e.getDepartment().getId() : null,
                    e.getDepartment() != null ? e.getDepartment().getName() : "",
                    e.getJobTitle() != null ? e.getJobTitle() : "",
                    e.getBaseSalary());
        }
    }
}
