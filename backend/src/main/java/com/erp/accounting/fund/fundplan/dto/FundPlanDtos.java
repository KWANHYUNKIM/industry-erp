package com.erp.accounting.fund.fundplan.dto;

import com.erp.accounting.fund.fundplan.FundPlan;
import com.erp.accounting.fund.fundplan.FundPlanDirection;
import com.erp.accounting.fund.fundplan.FundPlanMethod;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.time.LocalDate;

public final class FundPlanDtos {

    private FundPlanDtos() {}

    /** 원본은 필수 칸이 없다 — 입출구분 · 발생일자 · 입력구분은 기본값(출금 · 오늘 · 예금(현금))이 늘 들어 있다. */
    public record FundPlanRequest(
            @NotNull(message = "입출구분을 선택하세요.") FundPlanDirection direction,
            @NotNull(message = "발생일자를 입력하세요.") LocalDate planDate,
            Long departmentId,
            Long projectId,
            @NotNull(message = "입력구분을 선택하세요.") FundPlanMethod method,
            Long bankAccountId,
            @Size(max = 50, message = "관리번호는 50자까지 넣을 수 있습니다.") String noteNo,
            Long counterAccountId,
            Long partnerId,
            @PositiveOrZero(message = "금액은 0 이상이어야 합니다.") BigDecimal amount,
            @Size(max = 300, message = "입력한 글자가 너무 깁니다. 300자까지 넣을 수 있습니다.") String memo
    ) {}

    public record DeleteFundPlansRequest(@NotNull(message = "삭제할 전표를 선택하세요.") java.util.List<Long> ids) {}

    public record FundPlanResponse(
            Long id, FundPlanDirection direction, String directionName, LocalDate planDate,
            Long departmentId, Long projectId, String projectName,
            FundPlanMethod method, String methodName,
            Long bankAccountId, String bankAccountCode, String bankAccountName,
            Long bankGlAccountId, String bankGlAccountName,
            String noteNo,
            Long counterAccountId, String counterAccountCode, String counterAccountName,
            Long partnerId, String partnerCode, String partnerName,
            BigDecimal amount, String memo, String createdBy, String updatedBy
    ) {
        public static FundPlanResponse from(FundPlan p) {
            var b = p.getBankAccount();
            return new FundPlanResponse(
                    p.getId(), p.getDirection(), p.getDirection().getDisplayName(), p.getPlanDate(),
                    p.getDepartmentId(),
                    p.getProject() != null ? p.getProject().getId() : null,
                    p.getProject() != null ? p.getProject().getName() : null,
                    p.getMethod(), p.getMethod().getDisplayName(),
                    b != null ? b.getId() : null, b != null ? b.getCode() : null,
                    b != null ? (b.getName() != null ? b.getName() : b.getBankName() + " " + b.getAccountNo()) : null,
                    b != null ? b.getGlAccount().getId() : null, b != null ? b.getGlAccount().getName() : null,
                    p.getNoteNo(),
                    p.getCounterAccount() != null ? p.getCounterAccount().getId() : null,
                    p.getCounterAccount() != null ? p.getCounterAccount().getCode() : null,
                    p.getCounterAccount() != null ? p.getCounterAccount().getName() : null,
                    p.getPartner() != null ? p.getPartner().getId() : null,
                    p.getPartner() != null ? p.getPartner().getCode() : null,
                    p.getPartner() != null ? p.getPartner().getName() : null,
                    p.getAmount(), p.getMemo(), p.getCreatedBy(), p.getUpdatedBy());
        }
    }
}
