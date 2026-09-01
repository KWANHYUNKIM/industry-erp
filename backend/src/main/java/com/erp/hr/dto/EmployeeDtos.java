package com.erp.hr.dto;

import com.erp.hr.domain.Employee;
import com.erp.hr.domain.EmployeeAssignment;
import com.erp.hr.domain.enums.AssignmentType;
import jakarta.validation.constraints.Size;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;

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
            @Size(max = 100, message = "입력한 글자가 너무 깁니다. 100자까지 넣을 수 있습니다.")
            String jobTitle,
            @Size(max = 500, message = "입력한 글자가 너무 깁니다. 500자까지 넣을 수 있습니다.")
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
    /**
     * 사원 등록. 원본 사원(담당)등록의 칸이다.
     *
     * <p>사번은 사람이 정한다 — 회사마다 규칙이 다르고(입사연도·부서 접두어),
     * 우리가 지어내면 그 규칙과 어긋난 번호가 섞인다.
     */
    public record CreateEmployeeRequest(
            @Size(max = 50, message = "사번은 50자까지 넣을 수 있습니다.")
            @NotBlank(message = "사번을 입력하세요.") String code,
            @Size(max = 100, message = "성명은 100자까지 넣을 수 있습니다.")
            @NotBlank(message = "성명을 입력하세요.") String name,
            Long departmentId,
            @Size(max = 100, message = "입력한 글자가 너무 깁니다. 100자까지 넣을 수 있습니다.")
            String jobTitle,
            LocalDate hireDate,
            @PositiveOrZero(message = "기본급은 0 이상이어야 합니다.") BigDecimal baseSalary,
            /* 원본 사원(담당)등록 폼의 나머지 칸들 — 담을 데가 없어 그리지도 못했다. */
            @Size(max = 30, message = "입력한 글자가 너무 깁니다. 30자까지 넣을 수 있습니다.")
            String phone,
            @Size(max = 100, message = "입력한 글자가 너무 깁니다. 100자까지 넣을 수 있습니다.")
            String email,
            @Size(max = 100, message = "입력한 글자가 너무 깁니다. 100자까지 넣을 수 있습니다.")
            String searchKeyword,
            @Size(max = 200, message = "입력한 글자가 너무 깁니다. 200자까지 넣을 수 있습니다.")
            String remark
    ) {}

    /**
     * 사원 수정. <b>퇴사일과 사용 여부</b>가 여기 있다.
     *
     * <p>사원은 지우지 않는다 — 판매·구매·출하·작업지시의 담당자이고 급여·근태의 뿌리다.
     * 지우면 지난 전표가 누구 것인지 잃는다. 퇴사하면 사용중단으로 내린다.
     */
    public record UpdateEmployeeRequest(
            @Size(max = 100, message = "성명은 100자까지 넣을 수 있습니다.")
            @NotBlank(message = "성명을 입력하세요.") String name,
            Long departmentId,
            @Size(max = 100, message = "입력한 글자가 너무 깁니다. 100자까지 넣을 수 있습니다.")
            String jobTitle,
            LocalDate hireDate,
            LocalDate resignDate,
            @PositiveOrZero(message = "기본급은 0 이상이어야 합니다.") BigDecimal baseSalary,
            /* 원본 사원(담당)등록 폼의 나머지 칸들 — 담을 데가 없어 그리지도 못했다. */
            @Size(max = 30, message = "입력한 글자가 너무 깁니다. 30자까지 넣을 수 있습니다.")
            String phone,
            @Size(max = 100, message = "입력한 글자가 너무 깁니다. 100자까지 넣을 수 있습니다.")
            String email,
            @Size(max = 100, message = "입력한 글자가 너무 깁니다. 100자까지 넣을 수 있습니다.")
            String searchKeyword,
            @Size(max = 200, message = "입력한 글자가 너무 깁니다. 200자까지 넣을 수 있습니다.")
            String remark,
            Boolean active
    ) {}

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
            boolean active,
            /* 원본 [담당자연락처]·[담당자Email]·[검색창내용]·[적요]. */
            String phone, String email, String searchKeyword, String remark
    ) {
        public static EmployeeResponse from(Employee e) {
            return new EmployeeResponse(
                    e.getId(), e.getCode(), e.getName(),
                    e.getDepartment() != null ? e.getDepartment().getId() : null,
                    e.getDepartment() != null ? e.getDepartment().getName() : "",
                    e.getJobTitle() != null ? e.getJobTitle() : "",
                    e.getBaseSalary(),
                    e.getHireDate(), e.getResignDate(), e.isActive(),
                    e.getPhone(), e.getEmail(), e.getSearchKeyword(), e.getRemark());
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
                    null, hireDate, resignDate, active,
                    /* 연락처·적요는 급여가 아니다 — 가릴 것은 급여 칸 하나뿐이다. */
                    phone, email, searchKeyword, remark);
        }
    }
}
