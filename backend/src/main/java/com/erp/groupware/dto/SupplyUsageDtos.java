package com.erp.groupware.dto;

import com.erp.groupware.domain.SupplyUsage;
import com.erp.groupware.domain.enums.SupplyReturnStatus;
import jakarta.validation.constraints.Size;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import java.time.LocalDate;

public final class SupplyUsageDtos {

    private SupplyUsageDtos() {}

    public record CreateSupplyUsageRequest(
            @NotNull(message = "공용품을 선택하세요.") Long supplyItemId,
            @NotNull(message = "사용자를 선택하세요.") Long userId,
            @NotNull(message = "사용 일자를 선택하세요.") LocalDate useDate,
            @Size(max = 10, message = "입력한 글자가 너무 깁니다. 10자까지 넣을 수 있습니다.")
            String startTime,
            @Size(max = 10, message = "입력한 글자가 너무 깁니다. 10자까지 넣을 수 있습니다.")
            String endTime,
            boolean allDay,
            @Size(max = 200, message = "제목은 200자까지 넣을 수 있습니다.")
            @NotBlank(message = "제목을 입력하세요.") String title,
            @Size(max = 500, message = "입력한 글자가 너무 깁니다. 500자까지 넣을 수 있습니다.")
            String remark,
            @Size(max = 100, message = "입력한 글자가 너무 깁니다. 100자까지 넣을 수 있습니다.")
            String labelText,
            SupplyReturnStatus returnStatus
    ) {}

    /** null 필드는 변경하지 않는다. */
    public record UpdateSupplyUsageRequest(
            Long supplyItemId,
            Long userId,
            LocalDate useDate,
            @Size(max = 10, message = "입력한 글자가 너무 깁니다. 10자까지 넣을 수 있습니다.")
            String startTime,
            @Size(max = 10, message = "입력한 글자가 너무 깁니다. 10자까지 넣을 수 있습니다.")
            String endTime,
            Boolean allDay,
            @Size(max = 200, message = "입력한 글자가 너무 깁니다. 200자까지 넣을 수 있습니다.")
            String title,
            @Size(max = 500, message = "입력한 글자가 너무 깁니다. 500자까지 넣을 수 있습니다.")
            String remark,
            @Size(max = 100, message = "입력한 글자가 너무 깁니다. 100자까지 넣을 수 있습니다.")
            String labelText,
            SupplyReturnStatus returnStatus
    ) {}

    public record SupplyUsageResponse(
            Long id,
            Long supplyItemId, String supplyItemCode, String supplyItemName,
            Long userId, String userName,
            LocalDate useDate, String startTime, String endTime, boolean allDay,
            String title, String remark, String labelText,
            SupplyReturnStatus returnStatus, String returnStatusName
    ) {
        public static SupplyUsageResponse from(SupplyUsage u) {
            return new SupplyUsageResponse(
                    u.getId(),
                    u.getSupplyItem().getId(), u.getSupplyItem().getCode(), u.getSupplyItem().getName(),
                    u.getUser().getId(), u.getUser().getName(),
                    u.getUseDate(), u.getStartTime(), u.getEndTime(), u.isAllDay(),
                    u.getTitle(), u.getRemark(), u.getLabelText(),
                    u.getReturnStatus(), u.getReturnStatus().getDisplayName());
        }
    }
}
