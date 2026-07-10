package com.erp.dto;

import com.erp.domain.ScheduleEvent;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import java.time.LocalDate;

public final class ScheduleEventDtos {

    private ScheduleEventDtos() {}

    public record CreateScheduleEventRequest(
            @NotNull(message = "일자를 선택하세요.") LocalDate eventDate,
            String startTime,
            @NotBlank(message = "일정 제목을 입력하세요.") String title,
            String category,
            String owner,
            String remark
    ) {}

    /** null 필드는 변경하지 않음. */
    public record UpdateScheduleEventRequest(
            LocalDate eventDate,
            String startTime,
            String title,
            String category,
            String owner,
            String remark
    ) {}

    public record ScheduleEventResponse(
            Long id, LocalDate eventDate, String startTime, String title,
            String category, String owner, String remark, String createdBy
    ) {
        public static ScheduleEventResponse from(ScheduleEvent e) {
            return new ScheduleEventResponse(
                    e.getId(), e.getEventDate(), e.getStartTime(), e.getTitle(),
                    e.getCategory(), e.getOwner(), e.getRemark(), e.getCreatedBy());
        }
    }
}
