package com.erp.hr.service;

import com.erp.common.ApiException;
import com.erp.hr.domain.Attendance;
import com.erp.auth.domain.User;
import com.erp.hr.dto.AttendanceDtos.AttendanceResponse;
import com.erp.hr.repository.AttendanceRepository;
import com.erp.auth.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;
import com.erp.hr.dto.AttendanceDtos;

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
