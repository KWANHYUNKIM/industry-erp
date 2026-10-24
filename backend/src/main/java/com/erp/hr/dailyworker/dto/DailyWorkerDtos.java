package com.erp.hr.dailyworker.dto;

import com.erp.hr.dailyworker.DailyWorker;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

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
            @PositiveOrZero(message = "지방소득세는 0 이상이어야 합니다.") BigDecimal fixedLocalTax,
            @Size(max = 30, message = "입력한 글자가 너무 깁니다. 30자까지 넣을 수 있습니다.") String phone,
            @Size(max = 30, message = "입력한 글자가 너무 깁니다. 30자까지 넣을 수 있습니다.") String passportNo,
            Long projectId,
            Long attachmentFileId,
            @Size(max = 100, message = "입력한 글자가 너무 깁니다. 100자까지 넣을 수 있습니다.") String text1,
            @Size(max = 100, message = "입력한 글자가 너무 깁니다. 100자까지 넣을 수 있습니다.") String text2,
            @Size(max = 100, message = "입력한 글자가 너무 깁니다. 100자까지 넣을 수 있습니다.") String text3,
            BigDecimal num1, BigDecimal num2, BigDecimal num3,
            @Size(max = 1, message = "입력한 글자가 너무 깁니다. 1자까지 넣을 수 있습니다.") @jakarta.validation.constraints.Pattern(regexp = "[YN]?", message = "Y/N 형식은 Y 또는 N 이어야 합니다.") String yn1,
            @Size(max = 1, message = "입력한 글자가 너무 깁니다. 1자까지 넣을 수 있습니다.") @jakarta.validation.constraints.Pattern(regexp = "[YN]?", message = "Y/N 형식은 Y 또는 N 이어야 합니다.") String yn2,
            @Size(max = 1, message = "입력한 글자가 너무 깁니다. 1자까지 넣을 수 있습니다.") @jakarta.validation.constraints.Pattern(regexp = "[YN]?", message = "Y/N 형식은 Y 또는 N 이어야 합니다.") String yn3,
            LocalDate date1, LocalDate date2, LocalDate date3,
            @Size(max = 50, message = "입력한 글자가 너무 깁니다. 50자까지 넣을 수 있습니다.") String code1,
            @Size(max = 50, message = "입력한 글자가 너무 깁니다. 50자까지 넣을 수 있습니다.") String code2,
            @Size(max = 50, message = "입력한 글자가 너무 깁니다. 50자까지 넣을 수 있습니다.") String code3,
            List<@jakarta.validation.Valid PayAmount> payAmounts
    ) {}

    /** [급여지급사항] 기본 밖 항목 한 칸 — 수당 내역 · 공제 금액(원본 2026-10-21). 비우면(null) 그 항목은 0. */
    public record PayAmount(@jakarta.validation.constraints.NotNull Long itemId,
                            @PositiveOrZero(message = "금액은 0 이상이어야 합니다.") BigDecimal amount) {}

    public record DailyWorkerResponse(
            Long id, String code, String name, boolean foreigner, String nationality,
            Long departmentId, String department, String mobile, String email,
            LocalDate hireDate, LocalDate resignDate, String zipcode, String address,
            boolean employmentInsurance, boolean pensionAuto, BigDecimal pensionBase,
            boolean healthAuto, BigDecimal healthBase,
            String bankName, String accountNo, String accountHolder, String remark,
            BigDecimal dailyWage, BigDecimal fixedIncomeTax, BigDecimal fixedLocalTax, List<PayAmount> payAmounts,
            String phone, String passportNo, Long projectId, Long attachmentFileId,
            String text1, String text2, String text3, BigDecimal num1, BigDecimal num2, BigDecimal num3,
            String yn1, String yn2, String yn3, LocalDate date1, LocalDate date2, LocalDate date3,
            String code1, String code2, String code3
    ) {
        public static DailyWorkerResponse from(DailyWorker w) {
            return from(w, List.of());
        }

        public static DailyWorkerResponse from(DailyWorker w, List<PayAmount> payAmounts) {
            return new DailyWorkerResponse(
                    w.getId(), w.getCode(), w.getName(), w.isForeigner(), w.getNationality(),
                    w.getDepartment() != null ? w.getDepartment().getId() : null,
                    w.getDepartment() != null ? w.getDepartment().getName() : "",
                    w.getMobile(), w.getEmail(), w.getHireDate(), w.getResignDate(), w.getZipcode(), w.getAddress(),
                    w.isEmploymentInsurance(), w.isPensionAuto(), w.getPensionBase(),
                    w.isHealthAuto(), w.getHealthBase(),
                    w.getBankName(), w.getAccountNo(), w.getAccountHolder(), w.getRemark(),
                    w.getDailyWage(), w.getFixedIncomeTax(), w.getFixedLocalTax(), payAmounts,
                    w.getPhone(), w.getPassportNo(), w.getProjectId(), w.getAttachmentFileId(),
                    w.getText1(), w.getText2(), w.getText3(), w.getNum1(), w.getNum2(), w.getNum3(),
                    w.getYn1(), w.getYn2(), w.getYn3(), w.getDate1(), w.getDate2(), w.getDate3(),
                    w.getCode1(), w.getCode2(), w.getCode3());
        }
    }

    public record NextCodeResponse(String code) {}
}
