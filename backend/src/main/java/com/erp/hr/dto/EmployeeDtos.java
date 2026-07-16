package com.erp.hr.dto;

import com.erp.hr.domain.Employee;
import com.erp.hr.domain.EmployeeAssignment;
import com.erp.hr.domain.enums.AssignmentType;
import jakarta.validation.constraints.NotNull;

import java.math.BigDecimal;
import java.time.LocalDate;

public class EmployeeDtos {

    public record UpdateSalaryRequest(
            @NotNull(message = "기본급을 입력하세요.") BigDecimal baseSalary
    ) {}

    /** 부서 배치. departmentId 가 null 이면 미배치로 되돌린다. */
    public record AssignDepartmentRequest(Long departmentId) {}

    /** 인사발령. 유형에 따라 사원의 부서·직위·재직상태가 갱신된다. */
    public record CreateAssignmentRequest(
            @NotNull(message = "발령일을 입력하세요.") LocalDate assignDate,
            @NotNull(message = "발령 유형을 선택하세요.") AssignmentType type,
            Long departmentId,
            String jobTitle,
            String remark
    ) {}

    public record AssignmentResponse(
            Long id,
            Long employeeId,
            String employeeCode,
            String employeeName,
            LocalDate assignDate,
            AssignmentType type,
            String typeName,
            Long departmentId,
            String department,
            String jobTitle,
            String remark,
            String createdBy
    ) {
        public static AssignmentResponse from(EmployeeAssignment a) {
            return new AssignmentResponse(
                    a.getId(),
                    a.getEmployee().getId(), a.getEmployee().getCode(), a.getEmployee().getName(),
                    a.getAssignDate(), a.getType(), a.getType().getDisplayName(),
                    a.getDepartment() != null ? a.getDepartment().getId() : null,
                    a.getDepartment() != null ? a.getDepartment().getName() : "",
                    a.getJobTitle() != null ? a.getJobTitle() : "",
                    a.getRemark(), a.getCreatedBy());
        }
    }

    public record EmployeeResponse(
            Long id,
            String code,
            String name,
            Long departmentId,
            String department,
            String jobTitle,
            BigDecimal baseSalary,
            LocalDate hireDate,
            LocalDate resignDate,
            boolean active
    ) {
        public static EmployeeResponse from(Employee e) {
            return new EmployeeResponse(
                    e.getId(), e.getCode(), e.getName(),
                    e.getDepartment() != null ? e.getDepartment().getId() : null,
                    e.getDepartment() != null ? e.getDepartment().getName() : "",
                    e.getJobTitle() != null ? e.getJobTitle() : "",
                    e.getBaseSalary(),
                    e.getHireDate(), e.getResignDate(), e.isActive());
        }
    }
}
