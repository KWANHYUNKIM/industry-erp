package com.erp.config;

import com.erp.hr.domain.Attendance;
import com.erp.auth.domain.User;
import com.erp.hr.domain.VacationRequest;
import com.erp.hr.domain.enums.VacationStatus;
import com.erp.hr.repository.AttendanceRepository;
import com.erp.auth.repository.UserRepository;
import com.erp.hr.repository.VacationRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.Year;

/**
 * 최초 기동 시 인사(HR) 근태·휴가 데모 데이터를 생성한다.
 * 이미 존재하면 건너뛴다 (idempotent).
 */
@Slf4j
@Component
@Order(3)
@RequiredArgsConstructor
public class HrDataInitializer implements CommandLineRunner {

    private final UserRepository userRepository;
    private final AttendanceRepository attendanceRepository;
    private final VacationRepository vacationRepository;

    @Override
    @Transactional
    public void run(String... args) {
        userRepository.findByUsername("admin").ifPresent(this::seedAdmin);
        userRepository.findByUsername("manager").ifPresent(this::seedManager);
        userRepository.findByUsername("staff").ifPresent(this::seedStaff);
    }

    // --- 근태 데모: 다양한 상태(정상/지각/조퇴/결근)가 나오도록 최근 며칠 기록 ---

    private void seedAdmin(User u) {
        LocalDate t = LocalDate.now();
        ensureAttendance(u, t.minusDays(1), "09:00", "18:10", null);   // 정상
        ensureAttendance(u, t.minusDays(2), "08:55", "18:30", null);   // 정상(연장)
        ensureAttendance(u, t.minusDays(3), "09:00", "18:00", null);   // 정상
        seedVacations(u,
                vac("연차", currentYearDate(6, 1), 2, VacationStatus.APPROVED, "개인사유"));
    }

    private void seedManager(User u) {
        LocalDate t = LocalDate.now();
        ensureAttendance(u, t.minusDays(1), "09:22", "18:05", "교통지연");  // 지각
        ensureAttendance(u, t.minusDays(2), "08:58", "15:30", "병원방문");  // 조퇴
        ensureAttendance(u, t.minusDays(3), "09:00", "18:00", null);        // 정상
        seedVacations(u,
                vac("반차", currentYearDate(6, 10), 0.5, VacationStatus.APPROVED, "병원방문"),
                vac("병가", currentYearDate(6, 15), 2, VacationStatus.PENDING, "입원치료"));
    }

    private void seedStaff(User u) {
        LocalDate t = LocalDate.now();
        ensureAttendance(u, t.minusDays(1), "09:05", "18:00", null);   // 지각(9시 초과)
        ensureAttendance(u, t.minusDays(2), null, null, "무단결근");    // 결근
        ensureAttendance(u, t.minusDays(3), "08:50", "18:00", null);   // 정상
        seedVacations(u,
                vac("연차", currentYearDate(6, 20), 1, VacationStatus.PENDING, "경조사"),
                vac("연차", currentYearDate(6, 2), 3, VacationStatus.APPROVED, "가족여행"));
    }

    private void ensureAttendance(User u, LocalDate date, String clockIn, String clockOut, String note) {
        if (attendanceRepository.existsByUserIdAndWorkDate(u.getId(), date)) {
            return;
        }
        attendanceRepository.save(Attendance.builder()
                .user(u)
                .workDate(date)
                .clockIn(parse(clockIn))
                .clockOut(parse(clockOut))
                .note(note)
                .build());
        log.info("데모 근태 생성 → {} {}", u.getUsername(), date);
    }

    private void seedVacations(User u, VacationRequest... requests) {
        if (vacationRepository.existsByUserId(u.getId())) {
            return;
        }
        for (VacationRequest v : requests) {
            v.setUser(u);
            vacationRepository.save(v);
        }
        log.info("데모 휴가 생성 → {} ({}건)", u.getUsername(), requests.length);
    }

    private VacationRequest vac(String type, LocalDate start, double days, VacationStatus status, String reason) {
        return VacationRequest.builder()
                .type(type)
                .startDate(start)
                .endDate(start.plusDays((long) Math.max(0, Math.ceil(days) - 1)))
                .days(BigDecimal.valueOf(days))
                .status(status)
                .reason(reason)
                .build();
    }

    private LocalDate currentYearDate(int month, int day) {
        return LocalDate.of(Year.now().getValue(), month, day);
    }

    private LocalTime parse(String hhmm) {
        return hhmm == null ? null : LocalTime.parse(hhmm);
    }
}
