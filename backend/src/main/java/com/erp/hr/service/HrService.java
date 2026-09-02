package com.erp.hr.service;

import com.erp.common.ApiException;
import com.erp.common.DocumentNoGenerator;
import com.erp.hr.domain.Attendance;
import com.erp.auth.domain.User;
import com.erp.hr.domain.VacationRequest;
import com.erp.hr.domain.enums.VacationStatus;
import com.erp.hr.dto.HrDtos.AttendanceInputRequest;
import com.erp.hr.dto.HrDtos.AttendanceRow;
import com.erp.hr.dto.HrDtos.AttendanceSummaryRow;
import com.erp.hr.dto.HrDtos.CreateVacationRequest;
import com.erp.hr.dto.HrDtos.EmployeeResponse;
import com.erp.hr.dto.HrDtos.VacationRow;
import com.erp.hr.dto.HrDtos.VacationSummaryRow;
import com.erp.hr.repository.AttendanceRepository;
import com.erp.auth.repository.UserRepository;
import com.erp.hr.repository.VacationRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.time.LocalTime;
import java.time.Year;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

import static com.erp.hr.dto.HrDtos.statusOf;
import static com.erp.hr.dto.HrDtos.workHoursOf;
import com.erp.hr.dto.HrDtos;

@Service
@RequiredArgsConstructor
public class HrService {

    /** 기본 연차 부여 일수 */

    private final AttendanceRepository attendanceRepository;
    private final DocumentNoGenerator docNoGenerator;
    private final VacationRepository vacationRepository;
    private final UserRepository userRepository;
    private final com.erp.hr.repository.EmployeeRepository employeeRepository;

    /**
     * 계정에 이어진 사원. 안 이어져 있거나 그 사원이 지워졌으면 null.
     *
     * <p>User 는 사원 id 만 든다 — auth 는 기반층이라 hr 을 참조할 수 없다(CLAUDE.md 4.1).
     * 이름·직급·사원번호를 붙이는 일은 이쪽이 맡는다.
     */
    private com.erp.hr.domain.Employee employeeOf(User user) {
        Long id = user.getEmployeeId();
        return id == null ? null : employeeRepository.findById(id).orElse(null);
    }

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
                .map(v -> VacationRow.from(v, employeeOf(v.getUser())))
                .toList();
    }

    @Transactional
    public VacationRow createVacation(CreateVacationRequest req) {
        User user = resolveUser(req.userId(), req.username());
        if (req.endDate().isBefore(req.startDate())) {
            throw ApiException.badRequest("종료일이 시작일보다 빠를 수 없습니다.");
        }
        /*
         * 일수는 <b>기간 안이어야 한다.</b> 예전에는 클라이언트가 보낸 값을 그대로 저장해서
         * 하루짜리 휴가에 100일을 넣어도 통과했고, 그 값이 잔여일수현황에 그대로 더해졌다.
         * 반차(0.5)를 써야 하므로 하한은 0 초과로 두고, 상한만 달력 일수로 막는다.
         */
        long span = ChronoUnit.DAYS.between(req.startDate(), req.endDate()) + 1;
        if (req.days().signum() <= 0) {
            throw ApiException.badRequest("사용일수는 0보다 커야 합니다.");
        }
        if (req.days().compareTo(BigDecimal.valueOf(span)) > 0) {
            throw ApiException.badRequest(
                    "사용일수가 기간보다 많습니다. " + req.startDate() + "~" + req.endDate()
                            + " 은 " + span + "일인데 " + req.days().stripTrailingZeros().toPlainString() + "일을 넣었습니다.");
        }
        VacationRequest v = VacationRequest.builder()
                .user(user)
                // 채번은 DocumentNoGenerator 로만 한다(count()+1 은 삭제·동시성에서 겹친다).
                .docNo(docNoGenerator.next("AT-", "vacation_requests", "doc_no", "start_date", req.startDate()))
                .type(req.type())
                .startDate(req.startDate())
                .endDate(req.endDate())
                .days(req.days())
                .reason(req.reason())
                .status(VacationStatus.PENDING)
                .build();
        VacationRequest saved = vacationRepository.save(v);
        return VacationRow.from(saved, employeeOf(saved.getUser()));
    }

    /**
     * 근태(휴가) 삭제.
     *
     * <p>지금까지 지울 방법이 아예 없었다. 잘못 넣은 근태는 잔여일수에 그대로 남는데
     * 상태를 반려로 바꿔도 <b>줄이 사라지지는 않아</b> 근태현황이 계속 지저분해진다.
     * 승인된 것도 지울 수 있게 둔다 — 정정이 필요한 자리이고, 지우면 잔여일수도 같이 돌아온다.
     */
    @Transactional
    public void deleteVacation(Long id) {
        VacationRequest v = vacationRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("휴가 신청을 찾을 수 없습니다. id=" + id));
        vacationRepository.delete(v);
    }

    /** 상태 전이는 enum 이 강제한다 — 잘못된 값은 요청 역직렬화에서 이미 걸린다. */
    @Transactional
    public VacationRow updateVacationStatus(Long id, VacationStatus status) {
        VacationRequest v = vacationRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("휴가 신청을 찾을 수 없습니다. id=" + id));
        v.setStatus(status);
        return VacationRow.from(v, employeeOf(v.getUser()));
    }

    @Transactional(readOnly = true)
    public List<VacationSummaryRow> vacationSummary(Integer year, String employment) {
        LocalDate[] range = yearRange(year);
        int shownYear = range[0].getYear();
        List<VacationRequest> list = vacationRepository.findByStartDateBetweenWithUser(range[0], range[1]);

        Map<Long, BigDecimal> usedByUser = new LinkedHashMap<>();
        for (VacationRequest v : list) {
            // status 는 enum 이다. 예전에는 "승인".equals(v.getStatus()) 로 비교했는데
            // String 과 enum 이라 <b>언제나 거짓</b>이었고, 그래서 휴가잔여일수현황의
            // 사용일수가 늘 0 · 잔여가 늘 15일로 나왔다(승인된 휴가가 227건 있어도).
            if (v.getStatus() == VacationStatus.APPROVED) {
                usedByUser.merge(v.getUser().getId(),
                        v.getDays() == null ? BigDecimal.ZERO : v.getDays(),
                        BigDecimal::add);
            }
        }

        // 재직구분: 원본 휴가잔여일수현황의 조건이다(재직자/퇴사자/기타).
        // 예전에는 재직자만 무조건 걸러서 퇴사자의 미사용 연차(정산 대상)를 볼 방법이 없었다.
        return userRepository.findAll(Sort.by(Sort.Direction.ASC, "name")).stream()
                .filter(u -> employmentMatches(employment, u))
                .map(u -> VacationSummaryRow.of(
                        u, usedByUser.getOrDefault(u.getId(), BigDecimal.ZERO), shownYear, employeeOf(u)))
                .toList();
    }

    /** "ACTIVE"(재직자) | "RESIGNED"(퇴사자) | "ALL"(전체). 안 주면 재직자. */
    private boolean employmentMatches(String employment, User u) {
        if ("ALL".equalsIgnoreCase(employment)) return true;
        if ("RESIGNED".equalsIgnoreCase(employment)) return !u.isEnabled();
        return u.isEnabled();
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

    /**
     * 안 준 기간을 채운다(최근 한 달).
     *
     * <p>예전에는 <b>거꾸로 준 기간을 조용히 뒤집었다.</b> 시작 8/31 · 종료 8/1 로 물으면
     * 8/1~8/31 로 바꿔서 <b>한 달치 30줄</b>을 내줬다 — 화면 머리에는 여전히 8/31 ~ 8/1 이
     * 적혀 있으니, 적힌 기간과 표의 내용이 서로 다른 것을 사람이 알 길이 없었다.
     *
     * <p>이 저장소의 다른 기간 조회 21자리는 전부 거꾸로 된 기간에 <b>아무것도 안 준다</b>.
     * 여기만 달랐다. 뒤집기를 걷어내 나머지와 같게 맞춘다.
     */
    private LocalDate[] range(LocalDate from, LocalDate to) {
        LocalDate t = LocalDate.now();
        LocalDate f = from != null ? from : t.minusMonths(1);
        LocalDate e = to != null ? to : t;
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
