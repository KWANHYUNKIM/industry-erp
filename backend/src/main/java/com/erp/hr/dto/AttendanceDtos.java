package com.erp.hr.dto;

import com.erp.hr.domain.Attendance;

import java.time.Duration;
import java.time.LocalDate;
import java.time.LocalTime;

public final class AttendanceDtos {

    private AttendanceDtos() {}

    /** 정상 출근 기준시각 (이후 출근 시 지각) */
    private static final LocalTime WORK_START = LocalTime.of(9, 0);

    public record AttendanceResponse(
            Long id,
            Long userId, String userName,
            LocalDate workDate,
            LocalTime clockIn, LocalTime clockOut,
            Integer workMinutes, boolean late,
            String note
    ) {
        public static AttendanceResponse from(Attendance a) {
            Integer workMinutes = null;
            if (a.getClockIn() != null && a.getClockOut() != null) {
                workMinutes = (int) Duration.between(a.getClockIn(), a.getClockOut()).toMinutes();
            }
            boolean late = a.getClockIn() != null && a.getClockIn().isAfter(WORK_START);
            return new AttendanceResponse(
                    a.getId(),
                    a.getUser().getId(), a.getUser().getName(),
                    a.getWorkDate(),
                    a.getClockIn(), a.getClockOut(),
                    workMinutes, late,
                    a.getNote());
        }
    }
}
