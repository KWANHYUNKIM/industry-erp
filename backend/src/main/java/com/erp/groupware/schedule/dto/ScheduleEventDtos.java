package com.erp.groupware.schedule.dto;

import com.erp.groupware.schedule.ScheduleEvent;
import jakarta.validation.constraints.Size;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import java.time.LocalDate;
import java.util.List;

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
            String remark,
            /* 원본 [공유여부]·[프로젝트]. 안 주면 공유이고 프로젝트는 안 붙는다. */
            Boolean shared,
            Long projectId,
            /* 원본 [공유자] — 이름 콤마 구분 또는 '전체'. */
            @Size(max = 500, message = "입력한 글자가 너무 깁니다. 500자까지 넣을 수 있습니다.")
            String sharers,
            /* 원본 [권한] 게시글권한. 안 주면 원본 기본값(참석자 · 공유자 수정/삭제 켬, 이외사용자 조회 끔). */
            Boolean permAttendeeEdit,
            Boolean permSharerEdit,
            Boolean permOthersView,
            /* 원본 [반복설정]. 없으면 한 번. */
            @jakarta.validation.Valid RepeatRule repeat
    ) {}

    /**
     * 원본 반복설정 창(2026-10-13 실측). 반복주기 N + 단위 일 · 주 · 개월 · 년.
     * 주: 요일(일~토, 0=일). 개월: 기준 일(일자 1~31) / 주(1~4번째 · 5=마지막 + 요일). 년: 월 + 일.
     * 종료: 날짜(endDate) / 횟수(count — 펼쳐 넣는 일정 수).
     */
    public record RepeatRule(
            @NotNull(message = "반복 시작일자를 선택하세요.") LocalDate startDate,
            @jakarta.validation.constraints.Min(value = 1, message = "반복주기는 1 이상이어야 합니다.") int interval,
            @NotBlank(message = "반복 단위를 고르세요.") String unit,
            List<Integer> weekdays,
            String monthBasis,
            Integer monthDay,
            Integer weekOrdinal,
            Integer yearMonth,
            Integer yearDay,
            @NotBlank(message = "종료 방법을 고르세요.") String endType,
            LocalDate endDate,
            Integer count,
            @Size(max = 200, message = "입력한 글자가 너무 깁니다. 200자까지 넣을 수 있습니다.")
            String summary
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
            String remark,
            /* 원본 [공유여부]·[프로젝트]. 안 주면 공유이고 프로젝트는 안 붙는다. */
            Boolean shared,
            Long projectId,
            @Size(max = 500, message = "입력한 글자가 너무 깁니다. 500자까지 넣을 수 있습니다.")
            String sharers,
            Boolean permAttendeeEdit,
            Boolean permSharerEdit,
            Boolean permOthersView,
            /*
             * 반복 일정을 고칠 때 원본 '반복일정삭제' 창에서 고른 범위 — ONE(이번 일정만, 기본) · FOLLOWING(향후 모든 일정) · ALL(전체 반복일정).
             * 여러 줄에 걸치면 일자는 그대로 두고 나머지 칸만 같이 바꾼다.
             */
            String scope
    ) {}

    public record ScheduleEventResponse(
            Long id, LocalDate eventDate, String startTime, String endTime, String title,
            String category, String owner, String location, String attendees,
            String labelText, String remark, String createdBy,
            /** 원본 [공유여부]·[프로젝트]. 프로젝트는 id 와 <b>이름</b>을 같이 준다. */
            boolean shared, Long projectId, String projectName,
            String sharers, String repeatGroup, String repeatRule,
            boolean permAttendeeEdit, boolean permSharerEdit, boolean permOthersView
    ) {
        public static ScheduleEventResponse from(ScheduleEvent e) {
            return new ScheduleEventResponse(
                    e.getId(), e.getEventDate(), e.getStartTime(), e.getEndTime(), e.getTitle(),
                    e.getCategory(), e.getOwner(), e.getLocation(), e.getAttendees(),
                    e.getLabelText(),
                    e.getRemark(), e.getCreatedBy(),
                    e.isShared(),
                    e.getProject() != null ? e.getProject().getId() : null,
                    e.getProject() != null ? e.getProject().getName() : null,
                    e.getSharers(), e.getRepeatGroup(), e.getRepeatRule(),
                    e.isPermAttendeeEdit(), e.isPermSharerEdit(), e.isPermOthersView());
        }
    }

    /** 원본 '라벨검색' 의 등록 · 수정 — 라벨코드(수정에선 안 씀) · 라벨명 · 색상('#ff0000'). */
    public record SaveScheduleLabelRequest(
            @jakarta.validation.constraints.Size(max = 20, message = "라벨코드는 20자까지 넣을 수 있습니다.") String code,
            @jakarta.validation.constraints.Size(max = 20, message = "라벨명은 20자까지 넣을 수 있습니다.") String name,
            @jakarta.validation.constraints.Size(max = 7, message = "색상을 다시 고르세요.") String color
    ) {}

    public record ScheduleLabelResponse(Long id, String code, String name, String color, boolean active) {
        public static ScheduleLabelResponse from(com.erp.groupware.schedule.ScheduleLabel l) {
            return new ScheduleLabelResponse(l.getId(), l.getCode(), l.getName(), l.getColor(), l.isActive());
        }
    }
}
