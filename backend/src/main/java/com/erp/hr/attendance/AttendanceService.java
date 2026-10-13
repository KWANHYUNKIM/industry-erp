package com.erp.hr.attendance;

import com.erp.common.ApiException;
import com.erp.auth.user.User;
import com.erp.hr.attendance.dto.AttendanceDtos.AttendanceResponse;
import com.erp.hr.attendance.dto.AttendanceDtos.RecordRequest;
import org.springframework.util.StringUtils;
import com.erp.auth.user.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;
import com.erp.hr.attendance.dto.AttendanceDtos;

@Service
@RequiredArgsConstructor
public class AttendanceService {

    private final AttendanceRepository attendanceRepository;
    private final UserRepository userRepository;

    @Transactional(readOnly = true)
    public List<AttendanceResponse> findAll() {
        return attendanceRepository.findAllWithRefs().stream()
                .map(AttendanceResponse::from)
                .toList();
    }

    /** 기간으로 거른 기록 — 그룹웨어 출/퇴근 (ID) 현황 넷이 이것을 읽어 날마다 한 줄로 편다. */
    @Transactional(readOnly = true)
    public List<AttendanceResponse> findBetween(LocalDate from, LocalDate to) {
        return attendanceRepository.findByWorkDateBetweenWithUser(from, to).stream()
                .map(AttendanceResponse::from)
                .toList();
    }

    /**
     * '출/퇴근기록부' 창의 [출근] · [퇴근] (원본 E070305). 날짜 칸을 눌러 연 창이라 지난날도 넣는다.
     * 그날 출근이 없으면 고른 시각으로 출근(장소 · 외근 · 오전반차 · 사유와 함께), 출근만 있으면 퇴근, 둘 다 있으면 막는다.
     */
    @Transactional
    public AttendanceResponse record(String username, RecordRequest req) {
        LocalDate date = req.date() != null ? req.date() : LocalDate.now();
        LocalTime time;
        try {
            time = LocalTime.parse(req.time());
        } catch (java.time.format.DateTimeParseException e) {
            throw ApiException.badRequest("시간은 HH:MM 꼴로 넣습니다.");
        }
        Attendance att = attendanceRepository.findByUserUsernameAndWorkDate(username, date)
                .orElseGet(() -> {
                    User user = userRepository.findByUsername(username)
                            .orElseThrow(() -> ApiException.notFound("사용자를 찾을 수 없습니다."));
                    return Attendance.builder().user(user).workDate(date).build();
                });
        if (att.getClockIn() == null) {
            att.setClockIn(time);
            att.setPlace(StringUtils.hasText(req.place()) ? req.place().trim() : null);
            att.setOutsideWork(req.outsideWork());
            att.setHalfLeave(req.halfLeave());
            att.setNote(StringUtils.hasText(req.reason()) ? req.reason().trim() : null);
        } else if (att.getClockOut() == null) {
            if (time.isBefore(att.getClockIn())) {
                throw ApiException.badRequest("퇴근시간이 출근시간보다 빠릅니다.");
            }
            att.setClockOut(time);
            if (StringUtils.hasText(req.reason())) att.setNote(req.reason().trim());
        } else {
            throw ApiException.conflict("이미 퇴근 처리되었습니다.");
        }
        return AttendanceResponse.from(attendanceRepository.save(att));
    }

    @Transactional(readOnly = true)
    public AttendanceResponse today(String username) {
        return attendanceRepository.findByUserUsernameAndWorkDate(username, LocalDate.now())
                .map(AttendanceResponse::from)
                .orElse(null);
    }

    @Transactional
    public AttendanceResponse clockIn(String username) {
        LocalDate today = LocalDate.now();
        attendanceRepository.findByUserUsernameAndWorkDate(username, today).ifPresent(a -> {
            if (a.getClockIn() != null) {
                throw ApiException.conflict("이미 출근 처리되었습니다.");
            }
        });

        Attendance att = attendanceRepository.findByUserUsernameAndWorkDate(username, today)
                .orElseGet(() -> {
                    User user = userRepository.findByUsername(username)
                            .orElseThrow(() -> ApiException.notFound("사용자를 찾을 수 없습니다."));
                    return Attendance.builder().user(user).workDate(today).build();
                });
        att.setClockIn(LocalTime.now().withNano(0));
        return AttendanceResponse.from(attendanceRepository.save(att));
    }

    @Transactional
    public AttendanceResponse clockOut(String username) {
        LocalDate today = LocalDate.now();
        Attendance att = attendanceRepository.findByUserUsernameAndWorkDate(username, today)
                .orElseThrow(() -> ApiException.badRequest("출근 기록이 없습니다. 먼저 출근하세요."));
        if (att.getClockIn() == null) {
            throw ApiException.badRequest("출근 기록이 없습니다. 먼저 출근하세요.");
        }
        att.setClockOut(LocalTime.now().withNano(0));
        return AttendanceResponse.from(att);
    }
}
