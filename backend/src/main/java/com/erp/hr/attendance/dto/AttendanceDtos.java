package com.erp.hr.attendance.dto;

import com.erp.hr.attendance.Attendance;

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
            Integer workMinutes = com.erp.hr.attendance.WorkTime.workMinutes(a.getClockIn(), a.getClockOut());   // 점심 휴게 뺌(37회차)
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
