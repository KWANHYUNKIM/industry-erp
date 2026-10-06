package com.erp.hr.certificate.dto;

import com.erp.hr.certificate.Certificate;
import com.erp.hr.certificate.CertificateKind;
import com.erp.hr.employee.Employee;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.LocalDate;

public class CertificateDtos {

    public record CertificateRequest(
            @NotNull(message = "증명서종류를 선택 바랍니다.") CertificateKind kind,
            @NotNull(message = "사원번호를 입력 바랍니다.") Long employeeId,
            @Size(max = 200, message = "입력한 글자가 너무 깁니다. 200자까지 넣을 수 있습니다.")
            String purpose,
            @NotNull(message = "발행일을 입력 바랍니다.") LocalDate issueDate
    ) {}

    /** 목록 한 줄 + 인쇄에 쓰는 사원 값(성명 · 현주소 · 소속 · 직위 · 입사일 · 퇴사일). */
    public record CertificateResponse(
            Long id,
            String issueNo,
            CertificateKind kind,
            String kindName,
            Long employeeId,
            String employeeCode,
            String employeeName,
            String address,
            String department,
            String jobTitle,
            LocalDate hireDate,
            LocalDate resignDate,
            String purpose,
            LocalDate issueDate
    ) {
        public static CertificateResponse from(Certificate c) {
            Employee e = c.getEmployee();
            return new CertificateResponse(
                    c.getId(), c.getIssueYear() + "-" + c.getIssueSeq(),
                    c.getKind(), c.getKind().getDisplayName(),
                    e.getId(), e.getCode(), e.getName(), e.getAddress(),
                    e.getDepartment() != null ? e.getDepartment().getName() : "",
                    e.getJobTitle() != null ? e.getJobTitle() : "",
                    e.getHireDate(), e.getResignDate(),
                    c.getPurpose(), c.getIssueDate());
        }
    }
}
