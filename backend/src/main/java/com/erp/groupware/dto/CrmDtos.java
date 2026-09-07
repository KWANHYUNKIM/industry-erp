package com.erp.groupware.dto;

import com.erp.groupware.domain.CrmActivity;
import com.erp.groupware.domain.CrmStage;
import jakarta.validation.constraints.Size;
import jakarta.validation.constraints.NotNull;

import java.time.LocalDate;

public final class CrmDtos {

    private CrmDtos() {}

    public record CreateCrmRequest(
            LocalDate activityDate,
            @NotNull(message = "고객사를 선택하세요.") Long partnerId,
            @Size(max = 50, message = "입력한 글자가 너무 깁니다. 50자까지 넣을 수 있습니다.")
            String contactName,
            @Size(max = 50, message = "입력한 글자가 너무 깁니다. 50자까지 넣을 수 있습니다.")
            String charge,
            @Size(max = 500, message = "입력한 글자가 너무 깁니다. 500자까지 넣을 수 있습니다.")
            String activity,
            CrmStage stage,
            @Size(max = 300, message = "입력한 글자가 너무 깁니다. 300자까지 넣을 수 있습니다.")
            String nextAction
    ) {}

    public record UpdateCrmRequest(
            @Size(max = 50, message = "입력한 글자가 너무 깁니다. 50자까지 넣을 수 있습니다.")
            String contactName,
            @Size(max = 50, message = "입력한 글자가 너무 깁니다. 50자까지 넣을 수 있습니다.")
            String charge,
            @Size(max = 500, message = "입력한 글자가 너무 깁니다. 500자까지 넣을 수 있습니다.")
            String activity,
            CrmStage stage,
            @Size(max = 300, message = "입력한 글자가 너무 깁니다. 300자까지 넣을 수 있습니다.")
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
