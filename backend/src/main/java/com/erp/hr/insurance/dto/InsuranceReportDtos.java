package com.erp.hr.insurance.dto;

import com.erp.hr.insurance.InsuranceReport;
import com.erp.hr.insurance.InsuranceReportKind;
import com.erp.hr.insurance.InsuranceWorkplace;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.LocalDate;

public class InsuranceReportDtos {

    public record WorkplaceRequest(@Size(max = 100) String name, @Size(max = 11) String manageNo, @Size(max = 30) String phone) {}

    public record WorkplaceResponse(Long id, String name, String manageNo, String phone, boolean active) {
        public static WorkplaceResponse from(InsuranceWorkplace w) {
            return w == null ? null : new WorkplaceResponse(w.getId(), w.getName(), w.getManageNo(), w.getPhone(), w.isActive());
        }
    }

    /** 보험 넷의 신청구분 · 취득(상실)일 + 나머지 칸(detail JSON) · 피부양자 줄(dependents JSON). */
    public record ReportRequest(
            @NotNull LocalDate reportDate,
            @NotNull InsuranceReportKind kind,
            Long employeeId,
            Long pensionWorkplaceId, Long healthWorkplaceId, Long employmentWorkplaceId, Long accidentWorkplaceId,
            boolean pensionApply, LocalDate pensionDate,
            boolean healthApply, LocalDate healthDate,
            boolean employmentApply, LocalDate employmentDate,
            boolean accidentApply, LocalDate accidentDate,
            @Size(max = 30) String phone, String detail, String dependents) {}

    public record ReportResponse(
            Long id, LocalDate reportDate, Integer reportSeq, InsuranceReportKind kind, String formName,
            Long employeeId, String employeeCode, String employeeName,
            WorkplaceResponse pensionWorkplace, WorkplaceResponse healthWorkplace,
            WorkplaceResponse employmentWorkplace, WorkplaceResponse accidentWorkplace,
            boolean pensionApply, LocalDate pensionDate,
            boolean healthApply, LocalDate healthDate,
            boolean employmentApply, LocalDate employmentDate,
            boolean accidentApply, LocalDate accidentDate,
            String phone, String detail, String dependents, boolean deleted) {
        public static ReportResponse from(InsuranceReport r) {
            return new ReportResponse(r.getId(), r.getReportDate(), r.getReportSeq(), r.getKind(), r.getKind().formName(),
                    r.getEmployee().getId(), r.getEmployee().getCode(), r.getEmployee().getName(),
                    WorkplaceResponse.from(r.getPensionWorkplace()), WorkplaceResponse.from(r.getHealthWorkplace()),
                    WorkplaceResponse.from(r.getEmploymentWorkplace()), WorkplaceResponse.from(r.getAccidentWorkplace()),
                    r.isPensionApply(), r.getPensionDate(), r.isHealthApply(), r.getHealthDate(),
                    r.isEmploymentApply(), r.getEmploymentDate(), r.isAccidentApply(), r.getAccidentDate(),
                    r.getPhone(), r.getDetail(), r.getDependents(), r.isDeleted());
        }
    }
}
