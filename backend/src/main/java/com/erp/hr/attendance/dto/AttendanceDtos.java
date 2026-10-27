package com.erp.hr.attendance.dto;

import com.erp.hr.attendance.Attendance;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;

public final class AttendanceDtos {

    private AttendanceDtos() {}

    /** 정상 출근 기준시각 (이후 출근 시 지각) */
    public static final LocalTime WORK_START = LocalTime.of(9, 0);

    public record AttendanceResponse(
            Long id,
            Long userId, String userName, String username, String department,
            LocalDate workDate,
            LocalTime clockIn, LocalTime clockOut,
            Integer workMinutes, boolean late,
            String note,
            String place, boolean outsideWork, boolean halfLeave,
            /* 기록을 넣은 때 — 지각현황(ID) [입력시간]. 지난날 기록은 고른 시각과 다르다. */
            LocalDateTime enteredAt
    ) {
        public static AttendanceResponse from(Attendance a) {
            Integer workMinutes = com.erp.hr.attendance.WorkTime.workMinutes(a.getClockIn(), a.getClockOut());   // 점심 휴게 뺌(37회차)
            /* 오전반차를 켠 날은 늦게 오는 것이 정상이다. */
            boolean late = !a.isHalfLeave() && a.getClockIn() != null && a.getClockIn().isAfter(WORK_START);
            return new AttendanceResponse(
                    a.getId(),
                    a.getUser().getId(), a.getUser().getName(), a.getUser().getUsername(), a.getUser().getDepartment(),
                    a.getWorkDate(),
                    a.getClockIn(), a.getClockOut(),
                    workMinutes, late,
                    a.getNote(),
                    a.getPlace(), a.isOutsideWork(), a.isHalfLeave(),
                    a.getCreatedAt());
        }
    }

    /**
     * 출/퇴근기록부(ID) 의 '출/퇴근기록부' 창(원본 E070305, 2026-10-14 실측): 장소 · ☐외근 · 시간(누른 날 · 시 · 분) · ☐오전반차설정 · 사유.
     * 그날 출근이 없으면 출근, 있으면 퇴근으로 든다(창의 단추가 [출근] → [퇴근] 으로 바뀐다).
     */
    public record RecordRequest(
            LocalDate date,
            @NotBlank(message = "시간을 입력하세요.")
            @Pattern(regexp = "\\d{2}:\\d{2}", message = "시간은 HH:MM 꼴로 넣습니다.")
            String time,
            @Size(max = 50, message = "입력한 글자가 너무 깁니다. 50자까지 넣을 수 있습니다.")
            String place,
            boolean outsideWork,
            boolean halfLeave,
            @Size(max = 200, message = "입력한 글자가 너무 깁니다. 200자까지 넣을 수 있습니다.")
            String reason
    ) {}
}
