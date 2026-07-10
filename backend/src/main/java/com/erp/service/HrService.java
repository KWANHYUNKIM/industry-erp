package com.erp.service;

import com.erp.common.ApiException;
import com.erp.domain.Attendance;
import com.erp.domain.User;
import com.erp.domain.VacationRequest;
import com.erp.dto.HrDtos.AttendanceInputRequest;
import com.erp.dto.HrDtos.AttendanceRow;
import com.erp.dto.HrDtos.AttendanceSummaryRow;
import com.erp.dto.HrDtos.CreateVacationRequest;
import com.erp.dto.HrDtos.EmployeeResponse;
import com.erp.dto.HrDtos.VacationRow;
import com.erp.dto.HrDtos.VacationSummaryRow;
import com.erp.repository.AttendanceRepository;
import com.erp.repository.UserRepository;
import com.erp.repository.VacationRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.Year;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

import static com.erp.dto.HrDtos.statusOf;
import static com.erp.dto.HrDtos.workHoursOf;

@Service
@RequiredArgsConstructor
public class HrService {

    /** 기본 연차 부여 일수 */
    private static final BigDecimal DEFAULT_ANNUAL_DAYS = BigDecimal.valueOf(15);
    private static final Set<String> VALID_STATUS = Set.of("대기", "승인", "반려");

    private final AttendanceRepository attendanceRepository;
    private final VacationRepository vacationRepository;
    private final UserRepository userRepository;

    // ---------------------------------------------------------------- 사원

    @Transactional(readOnly = true)
    public List<EmployeeResponse> employees() {
        return userRepository.findAll(Sort.by(Sort.Direction.ASC, "name")).stream()
                .filter(User::isEnabled)
                .map(EmployeeResponse::from)
                .toList();
    }

    // ------------------------------------------------------------ 근태 조회

    @Transactional(readOnly = true)
    public List<AttendanceRow> attendance(LocalDate from, LocalDate to) {
        LocalDate[] range = range(from, to);
        return attendanceRepository.findByWorkDateBetweenWithUser(range[0], range[1]).stream()
                .map(AttendanceRow::from)
                .toList();
    }

    @Transactional(readOnly = true)
    public List<AttendanceSummaryRow> attendanceSummary(LocalDate from, LocalDate to) {
        LocalDate[] range = range(from, to);
        List<Attendance> list = attendanceRepository.findByWorkDateBetweenWithUser(range[0], range[1]);

        Map<Long, Acc> byUser = new LinkedHashMap<>();
        for (Attendance a : list) {
            User u = a.getUser();
            Acc acc = byUser.computeIfAbsent(u.getId(), k -> new Acc(u.getName(), u.getDepartment()));
            double wh = workHoursOf(a.getClockIn(), a.getClockOut());
            String status = statusOf(a.getClockIn(), a.getClockOut(), wh);
            acc.totalWorkHours += wh;
            switch (status) {
                case "정상" -> acc.normal++;
                case "지각" -> acc.late++;
                case "조퇴" -> acc.early++;
                default -> acc.absent++;
            }
        }

        List<AttendanceSummaryRow> result = new ArrayList<>();
        for (Acc a : byUser.values()) {
            int workDays = a.normal + a.late + a.early;
            result.add(new AttendanceSummaryRow(
                    a.name, a.department,
                    workDays, a.normal, a.late, a.early, a.absent,
                    Math.round(a.totalWorkHours * 10.0) / 10.0));
        }
        return result;
    }

    @Transactional
    public AttendanceRow upsertAttendance(AttendanceInputRequest req) {
        User user = resolveUser(req.userId(), req.username());
        LocalDate date = req.date();
        Attendance att = attendanceRepository.findByUserIdAndWorkDate(user.getId(), date)
                .orElseGet(() -> Attendance.builder().user(user).workDate(date).build());
        att.setClockIn(parseTime(req.clockIn()));
        att.setClockOut(parseTime(req.clockOut()));
        att.setNote(req.note());
        return AttendanceRow.from(attendanceRepository.save(att));
    }

    // -------------------------------------------------------------- 휴가

    @Transactional(readOnly = true)
    public List<VacationRow> vacations(Integer year) {
        LocalDate[] range = yearRange(year);
        return vacationRepository.findByStartDateBetweenWithUser(range[0], range[1]).stream()
                .map(VacationRow::from)
                .toList();
    }

    @Transactional
    public VacationRow createVacation(CreateVacationRequest req) {
        User user = resolveUser(req.userId(), req.username());
        if (req.endDate().isBefore(req.startDate())) {
            throw ApiException.badRequest("종료일이 시작일보다 빠를 수 없습니다.");
        }
        VacationRequest v = VacationRequest.builder()
                .user(user)
                .type(req.type())
                .startDate(req.startDate())
                .endDate(req.endDate())
                .days(req.days())
                .reason(req.reason())
                .status("대기")
                .build();
        return VacationRow.from(vacationRepository.save(v));
    }

    @Transactional
    public VacationRow updateVacationStatus(Long id, String status) {
        if (!VALID_STATUS.contains(status)) {
            throw ApiException.badRequest("올바른 상태값이 아닙니다: " + status);
        }
        VacationRequest v = vacationRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("휴가 신청을 찾을 수 없습니다. id=" + id));
        v.setStatus(status);
        return VacationRow.from(v);
    }

    @Transactional(readOnly = true)
    public List<VacationSummaryRow> vacationSummary(Integer year) {
        LocalDate[] range = yearRange(year);
        List<VacationRequest> list = vacationRepository.findByStartDateBetweenWithUser(range[0], range[1]);

        Map<Long, BigDecimal> usedByUser = new LinkedHashMap<>();
        for (VacationRequest v : list) {
            if ("승인".equals(v.getStatus())) {
                usedByUser.merge(v.getUser().getId(),
                        v.getDays() == null ? BigDecimal.ZERO : v.getDays(),
                        BigDecimal::add);
            }
        }

        return userRepository.findAll(Sort.by(Sort.Direction.ASC, "name")).stream()
                .filter(User::isEnabled)
                .map(u -> VacationSummaryRow.of(u, DEFAULT_ANNUAL_DAYS,
                        usedByUser.getOrDefault(u.getId(), BigDecimal.ZERO)))
                .toList();
    }

    // -------------------------------------------------------------- 내부 유틸

    private User resolveUser(Long userId, String username) {
        if (userId != null) {
            return userRepository.findById(userId)
                    .orElseThrow(() -> ApiException.notFound("사원을 찾을 수 없습니다. id=" + userId));
        }
        if (StringUtils.hasText(username)) {
            return userRepository.findByUsername(username)
                    .orElseThrow(() -> ApiException.notFound("사원을 찾을 수 없습니다: " + username));
        }
        throw ApiException.badRequest("사원(userId 또는 username)을 지정하세요.");
    }

    private LocalTime parseTime(String raw) {
        if (!StringUtils.hasText(raw)) {
            return null;
        }
        try {
            return LocalTime.parse(raw.trim());
        } catch (Exception e) {
            throw ApiException.badRequest("시간 형식이 올바르지 않습니다(HH:mm): " + raw);
        }
    }

    private LocalDate[] range(LocalDate from, LocalDate to) {
        LocalDate t = LocalDate.now();
        LocalDate f = from != null ? from : t.minusMonths(1);
        LocalDate e = to != null ? to : t;
        if (e.isBefore(f)) {
            LocalDate tmp = f;
            f = e;
            e = tmp;
        }
        return new LocalDate[]{f, e};
    }

    private LocalDate[] yearRange(Integer year) {
        int y = year != null ? year : Year.now().getValue();
        return new LocalDate[]{LocalDate.of(y, 1, 1), LocalDate.of(y, 12, 31)};
    }

    /** 근태 집계 누적기 */
    private static final class Acc {
        final String name;
        final String department;
        int normal, late, early, absent;
        double totalWorkHours;

        Acc(String name, String department) {
            this.name = name;
            this.department = department;
        }
    }
}
