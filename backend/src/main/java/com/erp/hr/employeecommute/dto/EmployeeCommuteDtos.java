package com.erp.hr.employeecommute.dto;

import com.erp.hr.employeecommute.EmployeeCommute;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.LocalDate;
import java.time.LocalDateTime;

public class EmployeeCommuteDtos {

    /** 원본 출/퇴근기록부 창 — 사원 · 장소(□외근) · 시간 · □오전반차설정 · 사유. 그날 처음이면 출근, 두 번째면 퇴근. */
    public record ClockRequest(
            @NotNull(message = "사원을 입력 바랍니다.") Long employeeId,
            @NotNull(message = "시간을 입력 바랍니다.") LocalDateTime at,
            @Size(max = 50, message = "입력한 글자가 너무 깁니다. 50자까지 넣을 수 있습니다.") String place,
            boolean outside,
            boolean morningHalf,
            @Size(max = 200, message = "입력한 글자가 너무 깁니다. 200자까지 넣을 수 있습니다.") String reason
    ) {}

    public record CommuteResponse(
            Long id, LocalDate workDate, Long employeeId, String employeeCode, String employeeName, String department,
            LocalDateTime clockIn, LocalDateTime clockOut, String place, boolean outside, boolean morningHalf, String reason
    ) {
        public static CommuteResponse from(EmployeeCommute c) {
            var e = c.getEmployee();
            return new CommuteResponse(c.getId(), c.getWorkDate(), e.getId(), e.getCode(), e.getName(),
                    e.getDepartment() != null ? e.getDepartment().getName() : "",
                    c.getClockIn(), c.getClockOut(), c.getPlace(), c.isOutside(), c.isMorningHalf(), c.getReason());
        }
    }
}
