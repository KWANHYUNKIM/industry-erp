package com.erp.hr.employee.dto;

import com.erp.hr.employee.Employee;
import com.erp.hr.employee.EmployeeAssignment;
import com.erp.hr.employee.AssignmentType;
import com.erp.hr.employee.PayType;
import jakarta.validation.constraints.Size;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

public class EmployeeDtos {

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

    /** 인사발령입력 한 줄(원본 발령일자 · 사번 · 발령구분 · 입사구분 · 발령 직위/직급 · 발령 부서 · 적요). */
    public record AssignmentSlipLine(
            LocalDate assignDate,
            @NotNull(message = "사번을 입력 바랍니다.") Long employeeId,
            @NotNull(message = "발령구분을 입력 바랍니다.") AssignmentType type,
            @Size(max = 50, message = "입력한 글자가 너무 깁니다. 50자까지 넣을 수 있습니다.")
            String hireKind,
            @Size(max = 100, message = "입력한 글자가 너무 깁니다. 100자까지 넣을 수 있습니다.")
            String jobTitle,
            Long departmentId,
            @Size(max = 500, message = "입력한 글자가 너무 깁니다. 500자까지 넣을 수 있습니다.")
            String remark
    ) {}

    /** 인사발령입력 전표. reflect = 원본 '[사원정보에 반영]'. */
    public record AssignmentSlipRequest(
            @NotNull(message = "일자를 입력 바랍니다.") LocalDate slipDate,
            boolean reflect,
            @jakarta.validation.Valid List<AssignmentSlipLine> lines
    ) {}

    public record AssignmentResponse(
            Long id,
            LocalDate slipDate,
            Integer slipNo,
            Long employeeId,
            String employeeCode,
            String employeeName,
            LocalDate assignDate,
            AssignmentType type,
            String typeName,
            Long departmentId,
            String department,
            String jobTitle,
            Long prevDepartmentId,
            String prevDepartment,
            String prevJobTitle,
            String hireKind,
            boolean employeeActive,
            String remark,
            String createdBy
    ) {
        public static AssignmentResponse from(EmployeeAssignment a) {
            return new AssignmentResponse(
                    a.getId(), a.getSlipDate(), a.getSlipNo(),
                    a.getEmployee().getId(), a.getEmployee().getCode(), a.getEmployee().getName(),
                    a.getAssignDate(), a.getType(), a.getType().getDisplayName(),
                    a.getDepartment() != null ? a.getDepartment().getId() : null,
                    a.getDepartment() != null ? a.getDepartment().getName() : "",
                    a.getJobTitle() != null ? a.getJobTitle() : "",
                    a.getPrevDepartment() != null ? a.getPrevDepartment().getId() : null,
                    a.getPrevDepartment() != null ? a.getPrevDepartment().getName() : "",
                    a.getPrevJobTitle() != null ? a.getPrevJobTitle() : "",
                    a.getHireKind(), a.getEmployee().isActive(),
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
     * 우리가 지어내면 그 규칙과 어긋난 번호가 섞인다. 다만 원본처럼 빈칸으로 두면
     * 다음 번호(00001 꼴)를 매긴다 — 폼은 그 번호를 미리 채워 보여 준다(/employees/next-code).
     */
    public record CreateEmployeeRequest(
            @Size(max = 50, message = "사번은 50자까지 넣을 수 있습니다.")
            String code,
            @Size(max = 100, message = "성명은 100자까지 넣을 수 있습니다.")
            @NotBlank(message = "사원명을 입력 바랍니다.") String name,
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
            String remark,
            /* 원본 관리 > 사원등록의 [급여구분]·[모바일]·[퇴사사유]·[주소]. 급여구분을 비우면 고정급. */
            PayType payType,
            @Size(max = 30, message = "입력한 글자가 너무 깁니다. 30자까지 넣을 수 있습니다.")
            String mobile,
            @Size(max = 100, message = "입력한 글자가 너무 깁니다. 100자까지 넣을 수 있습니다.")
            String resignReason,
            @Size(max = 200, message = "입력한 글자가 너무 깁니다. 200자까지 넣을 수 있습니다.")
            String address,
            /* 원본 [급여통장] 은행코드 · 은행명 · 계좌번호 · 예금주 */
            @Size(max = 10, message = "입력한 글자가 너무 깁니다. 10자까지 넣을 수 있습니다.") String bankCode,
            @Size(max = 50, message = "입력한 글자가 너무 깁니다. 50자까지 넣을 수 있습니다.") String bankName,
            @Size(max = 50, message = "입력한 글자가 너무 깁니다. 50자까지 넣을 수 있습니다.") String accountNo,
            @Size(max = 50, message = "입력한 글자가 너무 깁니다. 50자까지 넣을 수 있습니다.") String accountHolder
    ) {}

    /**
     * 사원 수정. <b>퇴사일과 사용 여부</b>가 여기 있다.
     *
     * <p>사원은 지우지 않는다 — 판매·구매·출하·작업지시의 담당자이고 급여·근태의 뿌리다.
     * 지우면 지난 전표가 누구 것인지 잃는다. 퇴사하면 사용중단으로 내린다.
     */
    public record UpdateEmployeeRequest(
            @Size(max = 100, message = "성명은 100자까지 넣을 수 있습니다.")
            @NotBlank(message = "사원명을 입력 바랍니다.") String name,
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
            /* 원본 관리 > 사원등록의 [급여구분]·[모바일]·[퇴사사유]·[주소]. 급여구분을 비우면 고정급. */
            PayType payType,
            @Size(max = 30, message = "입력한 글자가 너무 깁니다. 30자까지 넣을 수 있습니다.")
            String mobile,
            @Size(max = 100, message = "입력한 글자가 너무 깁니다. 100자까지 넣을 수 있습니다.")
            String resignReason,
            @Size(max = 200, message = "입력한 글자가 너무 깁니다. 200자까지 넣을 수 있습니다.")
            String address,
            /* 원본 [급여통장] 은행코드 · 은행명 · 계좌번호 · 예금주 */
            @Size(max = 10, message = "입력한 글자가 너무 깁니다. 10자까지 넣을 수 있습니다.") String bankCode,
            @Size(max = 50, message = "입력한 글자가 너무 깁니다. 50자까지 넣을 수 있습니다.") String bankName,
            @Size(max = 50, message = "입력한 글자가 너무 깁니다. 50자까지 넣을 수 있습니다.") String accountNo,
            @Size(max = 50, message = "입력한 글자가 너무 깁니다. 50자까지 넣을 수 있습니다.") String accountHolder,
            Boolean active
    ) {}

    /** 원본 사원등록 폼이 열릴 때 미리 채우는 다음 사원번호. */
    /** 인사카드 [인사자료] 한 줄 — 날짜 둘 + 글자 칸 일곱(항목마다 뜻이 다르다, EmployeeHrDetail 참고). */
    public record HrDetailRow(
            LocalDate fromDate, LocalDate toDate, LocalDate date3, LocalDate date4,
            @Size(max = 100, message = "입력한 글자가 너무 깁니다. 100자까지 넣을 수 있습니다.") String text1,
            @Size(max = 100, message = "입력한 글자가 너무 깁니다. 100자까지 넣을 수 있습니다.") String text2,
            @Size(max = 100, message = "입력한 글자가 너무 깁니다. 100자까지 넣을 수 있습니다.") String text3,
            @Size(max = 100, message = "입력한 글자가 너무 깁니다. 100자까지 넣을 수 있습니다.") String text4,
            @Size(max = 100, message = "입력한 글자가 너무 깁니다. 100자까지 넣을 수 있습니다.") String text5,
            @Size(max = 100, message = "입력한 글자가 너무 깁니다. 100자까지 넣을 수 있습니다.") String text6,
            @Size(max = 100, message = "입력한 글자가 너무 깁니다. 100자까지 넣을 수 있습니다.") String text7,
            @Size(max = 100, message = "입력한 글자가 너무 깁니다. 100자까지 넣을 수 있습니다.") String text8,
            @Size(max = 100, message = "입력한 글자가 너무 깁니다. 100자까지 넣을 수 있습니다.") String text9,
            @Size(max = 100, message = "입력한 글자가 너무 깁니다. 100자까지 넣을 수 있습니다.") String text10
    ) {
        public static HrDetailRow from(com.erp.hr.employee.EmployeeHrDetail d) {
            return new HrDetailRow(d.getFromDate(), d.getToDate(), d.getDate3(), d.getDate4(), d.getText1(), d.getText2(), d.getText3(),
                    d.getText4(), d.getText5(), d.getText6(), d.getText7(), d.getText8(), d.getText9(), d.getText10());
        }
    }

    public record NextCodeResponse(String code) {}

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
            String phone, String email, String searchKeyword, String remark,
            /* 원본 관리 > 사원등록의 [급여구분]·[모바일]·[퇴사사유]·[주소]. */
            PayType payType, String payTypeName, String mobile, String resignReason, String address,
            /* 원본 [급여통장] */
            String bankCode, String bankName, String accountNo, String accountHolder
    ) {
        public static EmployeeResponse from(Employee e) {
            return new EmployeeResponse(
                    e.getId(), e.getCode(), e.getName(),
                    e.getDepartment() != null ? e.getDepartment().getId() : null,
                    e.getDepartment() != null ? e.getDepartment().getName() : "",
                    e.getJobTitle() != null ? e.getJobTitle() : "",
                    e.getBaseSalary(),
                    e.getHireDate(), e.getResignDate(), e.isActive(),
                    e.getPhone(), e.getEmail(), e.getSearchKeyword(), e.getRemark(),
                    e.getPayType(), e.getPayType().getDisplayName(),
                    e.getMobile(), e.getResignReason(), e.getAddress(),
                    e.getBankCode(), e.getBankName(), e.getAccountNo(), e.getAccountHolder());
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
                    phone, email, searchKeyword, remark,
                    payType, payTypeName, mobile, resignReason, address,
                    /* 급여통장도 급여 정보다 — 기본급과 같이 가린다 */
                    null, null, null, null);
        }
    }
}
