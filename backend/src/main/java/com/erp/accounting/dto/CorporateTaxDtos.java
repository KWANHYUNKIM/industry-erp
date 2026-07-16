package com.erp.accounting.dto;

import com.erp.accounting.domain.CorporateTaxAdjustment;
import com.erp.accounting.domain.CorporateTaxReturn;
import com.erp.accounting.domain.enums.TaxAdjustmentType;
import com.erp.accounting.domain.enums.TaxReturnStatus;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

public class CorporateTaxDtos {

    /** 사업연도만 주면 손익계산서에서 당기순이익을 가져와 신고서를 만든다. */
    public record CreateReturnRequest(
            @NotNull(message = "사업연도를 입력하세요.") Integer fiscalYear,
            LocalDate periodFrom,
            LocalDate periodTo,
            BigDecimal lossCarryforward,
            BigDecimal taxCredit,
            BigDecimal penaltyTax,
            BigDecimal prepaidTax,
            String remark
    ) {}

    public record UpdateReturnRequest(
            BigDecimal lossCarryforward,
            BigDecimal taxCredit,
            BigDecimal penaltyTax,
            BigDecimal prepaidTax,
            String remark
    ) {}

    public record AddAdjustmentRequest(
            @NotNull(message = "조정 구분을 선택하세요.") TaxAdjustmentType type,
            @NotBlank(message = "조정 항목명을 입력하세요.") String name,
            @NotNull(message = "금액을 입력하세요.") BigDecimal amount,
            String remark
    ) {}

    public record AdjustmentResponse(
            Long id,
            TaxAdjustmentType type,
            String typeName,
            String name,
            BigDecimal amount,
            String remark
    ) {
        public static AdjustmentResponse from(CorporateTaxAdjustment a) {
            return new AdjustmentResponse(a.getId(), a.getType(), a.getType().getDisplayName(),
                    a.getName(), a.getAmount(), a.getRemark());
        }
    }

    public record TaxReturnResponse(
            Long id,
            int fiscalYear,
            LocalDate periodFrom,
            LocalDate periodTo,
            TaxReturnStatus status,
            String statusName,
            BigDecimal netIncome,
            BigDecimal additions,
            BigDecimal deductions,
            BigDecimal incomeForYear,
            BigDecimal lossCarryforward,
            BigDecimal taxBase,
            BigDecimal calculatedTax,
            BigDecimal taxCredit,
            BigDecimal penaltyTax,
            BigDecimal totalTax,
            BigDecimal prepaidTax,
            BigDecimal payableTax,
            BigDecimal localIncomeTax,
            String remark,
            String createdBy,
            List<AdjustmentResponse> adjustments
    ) {
        public static TaxReturnResponse from(CorporateTaxReturn r) {
            return new TaxReturnResponse(
                    r.getId(), r.getFiscalYear(), r.getPeriodFrom(), r.getPeriodTo(),
                    r.getStatus(), r.getStatus().getDisplayName(),
                    r.getNetIncome(), r.getAdditions(), r.getDeductions(),
                    // 각 사업연도 소득 = 당기순이익 + 익금산입 − 손금산입
                    r.getNetIncome().add(r.getAdditions()).subtract(r.getDeductions()),
                    r.getLossCarryforward(), r.getTaxBase(),
                    r.getCalculatedTax(), r.getTaxCredit(), r.getPenaltyTax(), r.getTotalTax(),
                    r.getPrepaidTax(), r.getPayableTax(), r.getLocalIncomeTax(),
                    r.getRemark(), r.getCreatedBy(),
                    r.getAdjustments().stream().map(AdjustmentResponse::from).toList());
        }
    }
}
