package com.erp.accounting.tax.paymentstatement.dto;

import com.erp.accounting.tax.paymentstatement.PaymentStatementBasis;
import com.erp.accounting.tax.paymentstatement.PaymentStatementKind;
import com.erp.accounting.tax.paymentstatement.PaymentStatementOtherIncome;
import com.erp.accounting.tax.simplepayment.SimplePaymentSubmitter;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import java.time.LocalDate;

/** 지급명세서파일생성(E030503) */
public final class PaymentStatementDtos {

    private PaymentStatementDtos() {}

    public record FileResponse(Long id, PaymentStatementKind kind, String kindName, int attrYear, int attrMonth,
                               LocalDate reportDate, boolean midSettlement, PaymentStatementBasis basis,
                               PaymentStatementOtherIncome otherIncome, String managerDept, String managerName,
                               String managerPhone, SimplePaymentSubmitter submitter) {}

    public record FileRequest(
            @NotNull PaymentStatementKind kind,
            @NotNull Integer attrYear,
            @NotNull Integer attrMonth,
            @NotNull LocalDate reportDate,
            @NotNull Boolean midSettlement,
            @NotNull PaymentStatementBasis basis,
            @NotNull PaymentStatementOtherIncome otherIncome,
            @NotBlank(message = "부서명을 입력바랍니다.") String managerDept,
            @NotBlank(message = "성명을 입력바랍니다.") String managerName,
            @NotBlank(message = "전화번호를 입력바랍니다.") String managerPhone,
            @NotNull SimplePaymentSubmitter submitter
    ) {}
}
