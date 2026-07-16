package com.erp.hr.dto;

import com.erp.hr.domain.Attendance;
import com.erp.auth.domain.User;
import com.erp.hr.domain.VacationRequest;
import com.erp.hr.domain.enums.VacationStatus;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Duration;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;

/**
 * 인사(HR) 근태·휴가 화면용 요청/응답 DTO 모음.
 */
public final class HrDtos {

    private HrDtos() {}

    /** 정상 출근 기준 시각 (이후 출근 시 지각) */
    static final LocalTime WORK_START = LocalTime.of(9, 0);
    /** 정상 퇴근 기준 시각 */
    static final LocalTime WORK_END = LocalTime.of(18, 0);
    /** 정상 근무 기준 시간 */
    static final double FULL_WORK_HOURS = 8.0;

    private static final DateTimeFormatter HHMM = DateTimeFormatter.ofPattern("HH:mm");

    /** 근태 상태·근무시간을 서버에서 계산한다. */
    public static String statusOf(LocalTime clockIn, LocalTime clockOut, double workHours) {
        if (clockIn == null) {
            return "결근";
        }
        if (clockIn.isAfter(WORK_START)) {
            return "지각";
        }
        if (clockOut != null && clockOut.isBefore(WORK_END) && workHours < FULL_WORK_HOURS) {
            return "조퇴";
        }
        return "정상";
    }

    public static double workHoursOf(LocalTime clockIn, LocalTime clockOut) {
        if (clockIn == null || clockOut == null) {
            return 0.0;
        }
        long minutes = Duration.between(clockIn, clockOut).toMinutes();
        if (minutes < 0) {
            minutes = 0;
        }
        return Math.round(minutes / 60.0 * 10.0) / 10.0;
    }

    static String fmt(LocalTime t) {
        return t == null ? null : t.format(HHMM);
    }

    // ---------------------------------------------------------------- 사원

    /** 사원 선택용 간단 응답 */
    public record EmployeeResponse(Long id, String username, String name, String department) {
        public static EmployeeResponse from(User u) {
            return new EmployeeResponse(u.getId(), u.getUsername(), u.getName(), u.getDepartment());
        }
    }

    // ------------------------------------------------------------ 근태 조회

    public record AttendanceRow(
            Long id,
            LocalDate date,
            String empName,
            String department,
            String clockIn,
            String clockOut,
            double workHours,
            String status,
            String note
    ) {
        public static AttendanceRow from(Attendance a) {
            double wh = workHoursOf(a.getClockIn(), a.getClockOut());
            String status = statusOf(a.getClockIn(), a.getClockOut(), wh);
            return new AttendanceRow(
                    a.getId(),
                    a.getWorkDate(),
                    a.getUser().getName(),
                    a.getUser().getDepartment(),
                    fmt(a.getClockIn()),
                    fmt(a.getClockOut()),
                    wh,
                    status,
                    a.getNote());
        }
    }

    /** 사원별 근태 집계 (근태현황) */
    public record AttendanceSummaryRow(
            String empName,
            String department,
            int workDays,
            int normalDays,
            int lateDays,
            int earlyLeaveDays,
            int absentDays,
            double totalWorkHours
    ) {}

    // ------------------------------------------------------------ 근태 입력

    public record AttendanceInputRequest(
            Long userId,
            String username,
            @NotNull(message = "일자를 입력하세요.") LocalDate date,
            String clockIn,
            String clockOut,
            String note
    ) {}

    // -------------------------------------------------------------- 휴가

    public record VacationRow(
            Long id,
            String empName,
            String department,
            String type,
            LocalDate startDate,
            LocalDate endDate,
            BigDecimal days,
            String reason,
            VacationStatus status,
            String statusName
    ) {
        public static VacationRow from(VacationRequest v) {
            return new VacationRow(
                    v.getId(),
                    v.getUser().getName(),
                    v.getUser().getDepartment(),
                    v.getType(),
                    v.getStartDate(),
                    v.getEndDate(),
                    v.getDays(),
                    v.getReason(),
                    v.getStatus(),
                    v.getStatus().getDisplayName());
        }
    }

    public record CreateVacationRequest(
            Long userId,
            String username,
            @NotBlank(message = "휴가 종류를 입력하세요.") String type,
            @NotNull(message = "시작일을 입력하세요.") LocalDate startDate,
            @NotNull(message = "종료일을 입력하세요.") LocalDate endDate,
            @NotNull(message = "사용일수를 입력하세요.") BigDecimal days,
            String reason
    ) {}

    public record UpdateVacationStatusRequest(
            @NotNull(message = "상태를 선택하세요.") VacationStatus status
    ) {}

    /** 사원별 휴가 잔여 (휴가잔여일수현황) */
    public record VacationSummaryRow(
            String empName,
            String department,
            BigDecimal totalDays,
            BigDecimal usedDays,
            BigDecimal remainingDays
    ) {
        public static VacationSummaryRow of(User u, BigDecimal totalDays, BigDecimal usedDays) {
            BigDecimal used = usedDays == null ? BigDecimal.ZERO : usedDays;
            return new VacationSummaryRow(
                    u.getName(),
                    u.getDepartment(),
                    totalDays.setScale(1, RoundingMode.HALF_UP),
                    used.setScale(1, RoundingMode.HALF_UP),
                    totalDays.subtract(used).setScale(1, RoundingMode.HALF_UP));
        }
    }
}
