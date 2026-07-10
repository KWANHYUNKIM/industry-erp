package com.erp.dto;

import com.erp.domain.CrmActivity;
import com.erp.domain.CrmStage;
import jakarta.validation.constraints.NotNull;

import java.time.LocalDate;

public final class CrmDtos {

    private CrmDtos() {}

    public record CreateCrmRequest(
            LocalDate activityDate,
            @NotNull(message = "고객사를 선택하세요.") Long partnerId,
            String contactName,
            String charge,
            String activity,
            CrmStage stage,
            String nextAction
    ) {}

    public record UpdateCrmRequest(
            String contactName,
            String charge,
            String activity,
            CrmStage stage,
            String nextAction
    ) {}

    public record CrmResponse(
            Long id, LocalDate activityDate,
            Long partnerId, String partnerCode, String partnerName,
            String contactName, String charge, String activity,
            CrmStage stage, String stageName, String nextAction
    ) {
        public static CrmResponse from(CrmActivity c) {
            return new CrmResponse(
                    c.getId(), c.getActivityDate(),
                    c.getPartner().getId(), c.getPartner().getCode(), c.getPartner().getName(),
                    c.getContactName(), c.getCharge(), c.getActivity(),
                    c.getStage(), c.getStage().getDisplayName(), c.getNextAction());
        }
    }
}
