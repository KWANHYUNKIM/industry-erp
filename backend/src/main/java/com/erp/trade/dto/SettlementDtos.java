package com.erp.trade.dto;

import com.erp.trade.domain.Settlement;
import com.erp.trade.domain.SettlementType;
import jakarta.validation.constraints.Size;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;

import java.math.BigDecimal;
import java.time.LocalDate;

public final class SettlementDtos {

    private SettlementDtos() {}

    public record CreateSettlementRequest(
            @NotNull(message = "유형을 선택하세요.") SettlementType type,
            @NotNull(message = "거래처를 선택하세요.") Long partnerId,
            @NotNull(message = "금액을 입력하세요.") @Positive(message = "금액은 0보다 커야 합니다.") BigDecimal amount,
            @Size(max = 30, message = "입력한 글자가 너무 깁니다. 30자까지 넣을 수 있습니다.")
            String method,
            LocalDate settleDate,
            /** 귀속 프로젝트. 원본 수금현황·지급현황 조건의 [프로젝트]. 안 정할 수 있다. */
            Long projectId,
            @Size(max = 500, message = "입력한 글자가 너무 깁니다. 500자까지 넣을 수 있습니다.")
            String note
    ) {}

    public record SettlementResponse(
            Long id, String docNo,
            SettlementType type, String typeName,
            Long partnerId, String partnerName,
            LocalDate settleDate,
            BigDecimal amount,
            String method,
            /** 귀속 프로젝트. 원본 수금현황·지급현황 조건의 [프로젝트]. */
            Long projectId, String projectName,
            String note, String createdBy,
            /** 회계반영 여부. 원본 결제내역조회의 [미반영 · 회계반영] 탭. */
            boolean accountingReflected
    ) {
        public static SettlementResponse from(Settlement s) {
            return new SettlementResponse(
                    s.getId(), s.getDocNo(),
                    s.getType(), s.getType().getDisplayName(),
                    s.getPartner().getId(), s.getPartner().getName(),
                    s.getSettleDate(), s.getAmount(),
                    s.getMethod(),
                    s.getProject() != null ? s.getProject().getId() : null,
                    s.getProject() != null ? s.getProject().getName() : null,
                    s.getNote(), s.getCreatedBy(), s.isAccountingReflected());
        }
    }
}
