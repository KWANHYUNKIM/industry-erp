package com.erp.hr.employeecommute.dto;

import com.erp.hr.employeecommute.EmployeeCommute;
import com.erp.hr.employeecommute.EmployeeCommuteEvent;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

public class EmployeeCommuteDtos {

    /**
     * 원본 출/퇴근기록부 창 — 사원 · 장소(□외근) · 시간 · □오전반차설정 · 사유.
     * out: false = [신규(F2)] 창의 [출근](그날 이미 출근했으면 막는다), true = 그날 기록을 열어 [퇴근],
     * 비우면 예전처럼 처음이면 출근 · 두 번째면 퇴근(API 시험이 쓴다).
     */
    public record ClockRequest(
            @NotNull(message = "사원을 입력 바랍니다.") Long employeeId,
            @NotNull(message = "시간을 입력 바랍니다.") LocalDateTime at,
            @Size(max = 50, message = "입력한 글자가 너무 깁니다. 50자까지 넣을 수 있습니다.") String place,
            boolean outside,
            boolean morningHalf,
            @Size(max = 200, message = "입력한 글자가 너무 깁니다. 200자까지 넣을 수 있습니다.") String reason,
            Boolean out,
            /** 퇴근 창 □오후반차설정 */
            boolean afternoonHalf
    ) {}

    /** 창 오른쪽 이력 한 줄을 펼쳐 [저장] — halfDay 는 출근이면 오전반차, 퇴근이면 오후반차. outside 는 출근만 */
    public record EventUpdateRequest(
            @NotNull(message = "시간을 입력 바랍니다.") LocalDateTime at,
            @Size(max = 50, message = "입력한 글자가 너무 깁니다. 50자까지 넣을 수 있습니다.") String place,
            boolean outside,
            boolean halfDay,
            @Size(max = 200, message = "입력한 글자가 너무 깁니다. 200자까지 넣을 수 있습니다.") String reason
    ) {}

    /** 이력 한 줄 — kind IN(출근) · OUT(퇴근) */
    public record EventResponse(Long id, String kind, LocalDateTime at, String place, boolean outside, boolean halfDay, String reason) {
        public static EventResponse from(EmployeeCommuteEvent e) {
            return new EventResponse(e.getId(), e.getKind(), e.getAt(), e.getPlace(), e.isOutside(), e.isHalfDay(), e.getReason());
        }
    }

    public record CommuteResponse(
            Long id, LocalDate workDate, Long employeeId, String employeeCode, String employeeName, String department,
            LocalDateTime clockIn, LocalDateTime clockOut, String place, boolean outside, boolean morningHalf, String reason,
            Integer workMinutes, boolean late, LocalDateTime enteredAt, boolean employeeActive,
            /** 퇴근 창 □오후반차설정 */
            boolean afternoonHalf,
            /** 퇴근 뒤 다시 출근한 횟수 — 원본 리스트 퇴근시간 옆 '+1' */
            int reentries,
            List<EventResponse> events
    ) {
        /** 지각 기준 — 근무현황 · 지각현황(ID)과 같은 09:00. 오전반차를 걸어 둔 날은 지각이 아니다. */
        private static final java.time.LocalTime WORK_START = java.time.LocalTime.of(9, 0);

        public static CommuteResponse from(EmployeeCommute c, List<EmployeeCommuteEvent> events) {
            var e = c.getEmployee();
            Integer minutes = c.getClockOut() == null ? null
                    : com.erp.hr.attendance.WorkTime.workMinutes(c.getClockIn().toLocalTime(), c.getClockOut().toLocalTime());
            boolean late = !c.isMorningHalf() && c.getClockIn().toLocalTime().isAfter(WORK_START);
            return new CommuteResponse(c.getId(), c.getWorkDate(), e.getId(), e.getCode(), e.getName(),
                    e.getDepartment() != null ? e.getDepartment().getName() : "",
                    c.getClockIn(), c.getClockOut(), c.getPlace(), c.isOutside(), c.isMorningHalf(), c.getReason(),
                    minutes, late, c.getCreatedAt(), e.isActive(), c.isAfternoonHalf(),
                    (int) Math.max(0, events.stream().filter(EmployeeCommuteEvent::isIn).count() - 1),
                    events.stream().map(EventResponse::from).toList());
        }
    }
}
