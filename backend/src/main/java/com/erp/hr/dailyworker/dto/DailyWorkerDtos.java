package com.erp.hr.dailyworker.dto;

import com.erp.hr.dailyworker.DailyWorker;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.time.LocalDate;

public class DailyWorkerDtos {

    public record DailyWorkerRequest(
            @Size(max = 20, message = "입력한 글자가 너무 깁니다. 20자까지 넣을 수 있습니다.") String code,
            @NotBlank(message = "성명을 입력 바랍니다.")
            @Size(max = 50, message = "입력한 글자가 너무 깁니다. 50자까지 넣을 수 있습니다.") String name,
            boolean foreigner,
            @Size(max = 50, message = "입력한 글자가 너무 깁니다. 50자까지 넣을 수 있습니다.") String nationality,
            Long departmentId,
            @Size(max = 30, message = "입력한 글자가 너무 깁니다. 30자까지 넣을 수 있습니다.") String mobile,
            @Size(max = 100, message = "입력한 글자가 너무 깁니다. 100자까지 넣을 수 있습니다.") String email,
            LocalDate hireDate,
            LocalDate resignDate,
            @Size(max = 10, message = "입력한 글자가 너무 깁니다. 10자까지 넣을 수 있습니다.") String zipcode,
            @Size(max = 300, message = "입력한 글자가 너무 깁니다. 300자까지 넣을 수 있습니다.") String address,
            boolean employmentInsurance,
            boolean pensionAuto,
            @PositiveOrZero(message = "기준소득월액은 0 이상이어야 합니다.") BigDecimal pensionBase,
            boolean healthAuto,
            @PositiveOrZero(message = "보수월액은 0 이상이어야 합니다.") BigDecimal healthBase,
            @Size(max = 50, message = "입력한 글자가 너무 깁니다. 50자까지 넣을 수 있습니다.") String bankName,
            @Size(max = 50, message = "입력한 글자가 너무 깁니다. 50자까지 넣을 수 있습니다.") String accountNo,
            @Size(max = 50, message = "입력한 글자가 너무 깁니다. 50자까지 넣을 수 있습니다.") String accountHolder,
            @Size(max = 500, message = "입력한 글자가 너무 깁니다. 500자까지 넣을 수 있습니다.") String remark,
            @PositiveOrZero(message = "일근무 금액은 0 이상이어야 합니다.") BigDecimal dailyWage,
            @PositiveOrZero(message = "소득세는 0 이상이어야 합니다.") BigDecimal fixedIncomeTax,
            @PositiveOrZero(message = "지방소득세는 0 이상이어야 합니다.") BigDecimal fixedLocalTax
    ) {}

    public record DailyWorkerResponse(
            Long id, String code, String name, boolean foreigner, String nationality,
            Long departmentId, String department, String mobile, String email,
            LocalDate hireDate, LocalDate resignDate, String zipcode, String address,
            boolean employmentInsurance, boolean pensionAuto, BigDecimal pensionBase,
            boolean healthAuto, BigDecimal healthBase,
            String bankName, String accountNo, String accountHolder, String remark,
            BigDecimal dailyWage, BigDecimal fixedIncomeTax, BigDecimal fixedLocalTax
    ) {
        public static DailyWorkerResponse from(DailyWorker w) {
            return new DailyWorkerResponse(
                    w.getId(), w.getCode(), w.getName(), w.isForeigner(), w.getNationality(),
                    w.getDepartment() != null ? w.getDepartment().getId() : null,
                    w.getDepartment() != null ? w.getDepartment().getName() : "",
                    w.getMobile(), w.getEmail(), w.getHireDate(), w.getResignDate(), w.getZipcode(), w.getAddress(),
                    w.isEmploymentInsurance(), w.isPensionAuto(), w.getPensionBase(),
                    w.isHealthAuto(), w.getHealthBase(),
                    w.getBankName(), w.getAccountNo(), w.getAccountHolder(), w.getRemark(),
                    w.getDailyWage(), w.getFixedIncomeTax(), w.getFixedLocalTax());
        }
    }

    public record NextCodeResponse(String code) {}
}
