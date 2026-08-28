package com.erp.groupware.dto;

import com.erp.groupware.domain.ScheduleEvent;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import java.time.LocalDate;

public final class ScheduleEventDtos {

    private ScheduleEventDtos() {}

    public record CreateScheduleEventRequest(
            @NotNull(message = "일자를 선택하세요.") LocalDate eventDate,
            String startTime,
            String endTime,
            @NotBlank(message = "일정 제목을 입력하세요.") String title,
            String category,
            String owner,
            String location,
            String attendees,
            /* 원본 [라벨] — '급함·대외비' 처럼 일정구분을 가로지르는 표시다. */
            String labelText,
            String remark
    ) {}

    /** null 필드는 변경하지 않음. */
    public record UpdateScheduleEventRequest(
            LocalDate eventDate,
            String startTime,
            String endTime,
            String title,
            String category,
            String owner,
            String location,
            String attendees,
            String labelText,
            String remark
    ) {}

    public record ScheduleEventResponse(
            Long id, LocalDate eventDate, String startTime, String endTime, String title,
            String category, String owner, String location, String attendees,
            String labelText, String remark, String createdBy
    ) {
        public static ScheduleEventResponse from(ScheduleEvent e) {
            return new ScheduleEventResponse(
                    e.getId(), e.getEventDate(), e.getStartTime(), e.getEndTime(), e.getTitle(),
                    e.getCategory(), e.getOwner(), e.getLocation(), e.getAttendees(),
                    e.getLabelText(),
                    e.getRemark(), e.getCreatedBy());
        }
    }
}
