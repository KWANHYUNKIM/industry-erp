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

    /**
     * 사원 한 줄. <b>기본급은 볼 수 있는 사람에게만</b> 담는다 —
     * {@link #maskSalary()} 를 참고.
     */
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

        /**
         * 기본급을 지운 사본.
         *
         * <p>사원 목록은 담당자 드롭다운으로 여기저기서 쓰인다(9개 화면 중 6개가 그 용도다).
         * 그래서 목록 자체를 권한으로 막으면 멀쩡한 화면이 줄줄이 빈칸이 된다.
         * 대신 <b>급여 칸만</b> 가린다 — 급여를 실제로 쓰는 곳은 사원등록·근로계약·급여 세 화면뿐이고
         * 그 화면들은 HR·PAYROLL 을 가진 사람이 연다.
         *
         * <p>이걸 안 하면 급여명세를 막아 놔도 사원 목록으로 기본급이 그대로 새어 나간다.
         */
        public EmployeeResponse maskSalary() {
            return new EmployeeResponse(id, code, name, departmentId, department, jobTitle,
                    null, hireDate, resignDate, active);
        }
    }
}
