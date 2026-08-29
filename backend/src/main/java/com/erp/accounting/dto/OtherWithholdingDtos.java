package com.erp.accounting.dto;

import com.erp.accounting.domain.OtherWithholding;
import com.erp.accounting.domain.enums.IncomeType;
import jakarta.validation.constraints.Size;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.NotNull;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

public class OtherWithholdingDtos {

    public record CreateWithholdingRequest(
            @NotNull(message = "지급일을 입력하세요.") LocalDate payDate,
            @NotNull(message = "소득구분을 선택하세요.") IncomeType incomeType,
            Long partnerId,
            @Size(max = 100, message = "입력한 글자가 너무 깁니다. 100자까지 넣을 수 있습니다.")
            String payeeName,
            @Size(max = 20, message = "입력한 글자가 너무 깁니다. 20자까지 넣을 수 있습니다.")
            String payeeRegNo,
            @NotNull(message = "지급액을 입력하세요.")
            @Positive(message = "지급액은 0보다 커야 합니다.") BigDecimal grossAmount,
            @Size(max = 200, message = "입력한 글자가 너무 깁니다. 200자까지 넣을 수 있습니다.")
            String description
    ) {}

    public record OtherWithholdingResponse(
            Long id,
            String docNo,
            LocalDate payDate,
            IncomeType incomeType,
            String incomeTypeName,
            Long partnerId,
            String payeeName,
            String payeeRegNo,
            BigDecimal grossAmount,
            BigDecimal expenseAmount,
            BigDecimal taxableAmount,
            BigDecimal incomeTax,
            BigDecimal localIncomeTax,
            BigDecimal netAmount,
            String description,
            String createdBy
    ) {
        public static OtherWithholdingResponse from(OtherWithholding w) {
            return new OtherWithholdingResponse(
                    w.getId(), w.getDocNo(), w.getPayDate(),
                    w.getIncomeType(), w.getIncomeType().getDisplayName(),
                    w.getPartner() != null ? w.getPartner().getId() : null,
                    w.getPayeeName(), w.getPayeeRegNo(),
                    w.getGrossAmount(), w.getExpenseAmount(), w.getTaxableAmount(),
                    w.getIncomeTax(), w.getLocalIncomeTax(), w.getNetAmount(),
                    w.getDescription(), w.getCreatedBy());
        }
    }

    /** 소득구분별 집계 (원천징수이행상황신고서의 기타원천세 부분) */
    public record IncomeTypeSummary(
            IncomeType incomeType,
            String incomeTypeName,
            int count,
            BigDecimal grossAmount,
            BigDecimal incomeTax,
            BigDecimal localIncomeTax
    ) {}

    public record MonthlySummary(
            String month,
            int count,
            BigDecimal totalGross,
            BigDecimal totalIncomeTax,
            BigDecimal totalLocalIncomeTax,
            BigDecimal totalNet,
            List<IncomeTypeSummary> byIncomeType,
            List<OtherWithholdingResponse> rows
    ) {}
}
