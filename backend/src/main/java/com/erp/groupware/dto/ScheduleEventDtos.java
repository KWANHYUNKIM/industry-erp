package com.erp.groupware.dto;

import com.erp.groupware.domain.ScheduleEvent;
import jakarta.validation.constraints.Size;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import java.time.LocalDate;

public final class ScheduleEventDtos {

    private ScheduleEventDtos() {}

    public record CreateScheduleEventRequest(
            @NotNull(message = "일자를 선택하세요.") LocalDate eventDate,
            @Size(max = 10, message = "입력한 글자가 너무 깁니다. 10자까지 넣을 수 있습니다.")
            String startTime,
            @Size(max = 10, message = "입력한 글자가 너무 깁니다. 10자까지 넣을 수 있습니다.")
            String endTime,
            @Size(max = 200, message = "일정 제목은 200자까지 넣을 수 있습니다.")
            @NotBlank(message = "일정 제목을 입력하세요.") String title,
            @Size(max = 30, message = "입력한 글자가 너무 깁니다. 30자까지 넣을 수 있습니다.")
            String category,
            @Size(max = 50, message = "입력한 글자가 너무 깁니다. 50자까지 넣을 수 있습니다.")
            String owner,
            @Size(max = 200, message = "입력한 글자가 너무 깁니다. 200자까지 넣을 수 있습니다.")
            String location,
            @Size(max = 500, message = "입력한 글자가 너무 깁니다. 500자까지 넣을 수 있습니다.")
            String attendees,
            /* 원본 [라벨] — '급함·대외비' 처럼 일정구분을 가로지르는 표시다. */
            @Size(max = 100, message = "입력한 글자가 너무 깁니다. 100자까지 넣을 수 있습니다.")
            String labelText,
            @Size(max = 500, message = "입력한 글자가 너무 깁니다. 500자까지 넣을 수 있습니다.")
            String remark
    ) {}

    /** null 필드는 변경하지 않음. */
    public record UpdateScheduleEventRequest(
            LocalDate eventDate,
            @Size(max = 10, message = "입력한 글자가 너무 깁니다. 10자까지 넣을 수 있습니다.")
            String startTime,
            @Size(max = 10, message = "입력한 글자가 너무 깁니다. 10자까지 넣을 수 있습니다.")
            String endTime,
            @Size(max = 200, message = "입력한 글자가 너무 깁니다. 200자까지 넣을 수 있습니다.")
            String title,
            @Size(max = 30, message = "입력한 글자가 너무 깁니다. 30자까지 넣을 수 있습니다.")
            String category,
            @Size(max = 50, message = "입력한 글자가 너무 깁니다. 50자까지 넣을 수 있습니다.")
            String owner,
            @Size(max = 200, message = "입력한 글자가 너무 깁니다. 200자까지 넣을 수 있습니다.")
            String location,
            @Size(max = 500, message = "입력한 글자가 너무 깁니다. 500자까지 넣을 수 있습니다.")
            String attendees,
            @Size(max = 100, message = "입력한 글자가 너무 깁니다. 100자까지 넣을 수 있습니다.")
            String labelText,
            @Size(max = 500, message = "입력한 글자가 너무 깁니다. 500자까지 넣을 수 있습니다.")
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
