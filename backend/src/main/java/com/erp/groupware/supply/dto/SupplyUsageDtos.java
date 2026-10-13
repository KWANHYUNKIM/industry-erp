package com.erp.groupware.supply.dto;

import com.erp.groupware.supply.SupplyUsage;
import com.erp.groupware.supply.SupplyReturnStatus;
import com.erp.groupware.schedule.dto.ScheduleEventDtos.RepeatRule;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Size;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import java.time.LocalDate;
import java.util.List;

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
            SupplyReturnStatus returnStatus,
            /** 원본 [반복설정] — 있으면 날마다 한 줄씩 펼쳐 넣는다(일정관리와 같은 창 · 같은 규칙). */
            @Valid RepeatRule repeat
    ) {}

    /** null 필드는 변경하지 않는다. scope 는 반복 줄일 때 '이번 일정만(ONE) · 향후 모든 일정(FOLLOWING) · 전체 반복일정(ALL)'. */
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
            SupplyReturnStatus returnStatus,
            String scope
    ) {}

    /** 원본 하단 [라벨변경] — 체크한 줄들에 '라벨검색창' 에서 고른 라벨을 붙인다(그 줄만, 반복 묶음은 따라가지 않는다). */
    public record ChangeSupplyLabelRequest(
            List<Long> ids,
            @Size(max = 100, message = "입력한 글자가 너무 깁니다. 100자까지 넣을 수 있습니다.")
            String labelText
    ) {}

    public record SupplyUsageResponse(
            Long id,
            Long supplyItemId, String supplyItemCode, String supplyItemName,
            Long userId, String userName,
            LocalDate useDate, String startTime, String endTime, boolean allDay,
            String title, String remark, String labelText,
            SupplyReturnStatus returnStatus, String returnStatusName,
            String repeatGroup, String repeatRule
    ) {
        public static SupplyUsageResponse from(SupplyUsage u) {
            return new SupplyUsageResponse(
                    u.getId(),
                    u.getSupplyItem().getId(), u.getSupplyItem().getCode(), u.getSupplyItem().getName(),
                    u.getUser().getId(), u.getUser().getName(),
                    u.getUseDate(), u.getStartTime(), u.getEndTime(), u.isAllDay(),
                    u.getTitle(), u.getRemark(), u.getLabelText(),
                    u.getReturnStatus(), u.getReturnStatus().getDisplayName(),
                    u.getRepeatGroup(), u.getRepeatRule());
        }
    }
}
