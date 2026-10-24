package com.erp.hr.attendancekind;

import com.erp.hr.attendancekind.dto.CommuteRuleDtos.ReflectLine;
import com.erp.hr.employee.Employee;
import com.erp.hr.employeecommute.EmployeeCommute;
import com.erp.hr.employeecommute.EmployeeCommuteEvent;
import com.erp.hr.employeecommute.EmployeeCommuteEventRepository;
import com.erp.hr.employeecommute.EmployeeCommuteRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Duration;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * 근태입력 [출/퇴근 ▲ › 사원기준] '출/퇴근기록' 창의 셈 — 출/퇴근기록부(사원)의 기록을 근태항목(유형 출/퇴근)의
 * 출/퇴근반영기준으로 근태 줄(근태일자 · 사원 · 근태 · 근태(일/시간))로 바꾼다. 저장은 근태입력이 한다.
 *
 * <p>원본 E020710 · E020725 2026-10-13 실측(변종호 10/13 출근 14:08:35 · 퇴근 14:11:29, 직접설정 기준시간 09:00~18:00):
 * <ul>
 *   <li>지각 · 일 → 1.00, 지각 · 시간 → 5.15 (09:00 ~ 14:09 = 309분), 조퇴 · 시간 → 3.82 (14:11 ~ 18:00 = 229분),
 *       근무/추가근무시간 · 시간 → 0.03 (14:09 ~ 14:11 = 2분). 분/60 을 소수 둘째 자리로 반올림.</li>
 *   <li>시각은 <b>가까운 분으로 반올림</b>한다(30초부터 올림) — 2026-10-13 2차 실측: 출근 10:30:25 → 지각 90분(1.50),
 *       10:30:48 → 91분(1.52). 위 14:08:35 → 14:09, 14:11:29 → 14:11 도 같은 규칙이다(예전엔 출근 올림 · 퇴근 버림으로 읽었다).</li>
 *   <li>적용기준이 '근무시간설정기준' 이면 아무 줄도 생기지 않았다(원본 회사에 근무시간설정이 없다) — 우리도 셈하지 않는다.</li>
 *   <li>도움말: 지각은 기준시간 안의 출근, 조퇴는 기준시간 안의 퇴근(반차설정 시간 안에 반차 기록이 있으면 빼고),
 *       근무/추가근무시간은 기준시간 안의 근무. 반영단위는 '설정된 시간 단위로 반영되며 그 나머지는 반영되지 않습니다'.</li>
 * </ul>
 * 2026-10-13 2차 실측(QA관리-지각 직접설정 09:00~18:00 · 시간, 변종호 10/05(월) 10:30:25~16:20 · 10/06(화) 출근만 10:30 · 10/10(토) 10:30:48~16:20):
 * <ul>
 *   <li>순서는 <b>제외시간 → 최대시간 → 반영단위 → 최소시간</b>. 제외 10:00~10:20 + 최대 1시간 → 1.00(70분 → 60),
 *       제외 10:00~10:20 + 최소 1시간15분 → 줄 없음(70 &lt; 75), 반영단위 40분 → 1.33(80분), 반영단위 40분 + 최소 1시간25분 → 줄 없음(80 &lt; 85),
 *       반영단위 40분 + 최대 1시간 → 0.67(60 → 40).</li>
 *   <li>퇴근이 없는 날(출근만)도 지각은 잡힌다. 일별 줄의 적요는 '출근: 10:30 / 퇴근: 16:20', 퇴근이 없으면 '퇴근: 00:00'. 기간별 줄은 적요가 빈다.</li>
 *   <li>요일: 토를 고르지 않으면 토요일 기록은 빠지고, 고르면 들어간다(기간별 4.52 = 1.50 + 1.50 + 1.52, 근태일자는 기간 끝 10/13).</li>
 *   <li>업무일/휴일: '업무일' · '휴일' 을 고르면 평일 · 토요일 모두 아무 줄도 생기지 않았다 — 원본 회사에 업무일 달력(근무시간설정)이 없어서다.
 *       우리도 업무일 달력이 없으므로 '전체' 가 아니면 반영하지 않는다.</li>
 * </ul>
 * 계산식은 셈하지 않는다.
 */
@Service
@RequiredArgsConstructor
public class CommuteReflectService {

    public enum Mode { PERIOD, DAILY }

    private static final LocalTime DEFAULT_FROM = LocalTime.of(9, 0);
    private static final LocalTime DEFAULT_TO = LocalTime.of(18, 0);

    private final AttendanceKindRepository kindRepository;
    private final EmployeeCommuteRepository commuteRepository;
    private final EmployeeCommuteEventRepository eventRepository;

    @Transactional(readOnly = true)
    public List<ReflectLine> reflect(LocalDate from, LocalDate to, Collection<Long> kindIds, Collection<Long> employeeIds,
                                     Collection<Long> departmentIds, Mode mode) {
        List<AttendanceKind> kinds = kindRepository.findCommuteKinds().stream()
                .filter(AttendanceKind::isActive)
                .filter(k -> kindIds == null || kindIds.isEmpty() || kindIds.contains(k.getId()))
                .toList();
        if (kinds.isEmpty()) return List.of();
        List<EmployeeCommute> commutes = commuteRepository.findInPeriod(from, to).stream()
                .filter(c -> employeeIds == null || employeeIds.isEmpty() || employeeIds.contains(c.getEmployee().getId()))
                .filter(c -> departmentIds == null || departmentIds.isEmpty() || (c.getEmployee().getDepartment() != null
                        && departmentIds.contains(c.getEmployee().getDepartment().getId())))
                .toList();
        Map<Long, List<EmployeeCommuteEvent>> events = eventRepository.findInPeriod(from, to).stream()
                .collect(Collectors.groupingBy(e -> e.getCommute().getId(), LinkedHashMap::new, Collectors.toList()));

        List<ReflectLine> daily = new ArrayList<>();
        for (EmployeeCommute c : commutes) {
            List<EmployeeCommuteEvent> evs = events.getOrDefault(c.getId(), List.of());
            for (AttendanceKind k : kinds) {
                BigDecimal amount = amount(k.getCommuteRule(), c, evs);
                if (amount != null) daily.add(line(c.getWorkDate(), c.getEmployee(), k, amount, note(c, evs)));
            }
        }
        if (mode == Mode.DAILY) return daily;
        // 기간별 — 사원 · 근태항목마다 한 줄, 근태일자는 기간 끝
        Map<String, ReflectLine> sum = new LinkedHashMap<>();
        for (ReflectLine l : daily) {
            sum.merge(l.employeeId() + "/" + l.kindId(), new ReflectLine(to, l.employeeId(), l.employeeCode(), l.employeeName(),
                    l.departmentName(), l.kindId(), l.kindCode(), l.kindName(), l.amount(), null),
                    (a, b) -> new ReflectLine(to, a.employeeId(), a.employeeCode(), a.employeeName(), a.departmentName(),
                            a.kindId(), a.kindCode(), a.kindName(), a.amount().add(b.amount()), null));
        }
        return new ArrayList<>(sum.values());
    }

    /** 한 사원 · 하루 · 한 규칙의 근태량. 반영하지 않으면 null. */
    static BigDecimal amount(CommuteRule r, EmployeeCommute c, List<EmployeeCommuteEvent> evs) {
        if (r == null || !r.isActive() || !r.isDirectBasis() || r.getMethod() == CommuteRuleMethod.FORMULA) return null;
        LocalDate date = c.getWorkDate();
        if (!dayMatches(r, date)) return null;
        LocalDateTime bs = at(date, r.getBaseFrom(), DEFAULT_FROM);
        LocalDateTime be = at(date, r.getBaseTo(), DEFAULT_TO);
        if (!be.isAfter(bs)) return null;

        List<LocalDateTime[]> spans = new ArrayList<>();
        switch (r.getMethod()) {
            case LATE -> {
                LocalDateTime in = c.getClockIn();
                if (in == null || !in.isAfter(bs) || in.isAfter(be)) return null;
                if (r.isHalfUse() && c.isMorningHalf() && within(r, date, in)) return null;
                spans.add(new LocalDateTime[]{bs, roundMinute(in)});
            }
            case EARLY_LEAVE -> {
                LocalDateTime out = evs.stream().filter(e -> !e.isIn()).map(EmployeeCommuteEvent::getAt)
                        .reduce((a, b) -> b).orElse(c.getClockOut());
                if (out == null || out.isBefore(bs) || !out.isBefore(be)) return null;
                if (r.isHalfUse() && c.isAfternoonHalf() && within(r, date, out)) return null;
                spans.add(new LocalDateTime[]{roundMinute(out), be});
            }
            case WORK_TIME -> {
                List<LocalDateTime[]> pairs = pairs(c, evs);
                for (LocalDateTime[] p : pairs) {
                    LocalDateTime s = max(roundMinute(p[0]), bs);
                    LocalDateTime e = min(roundMinute(p[1]), be);
                    if (e.isAfter(s)) spans.add(new LocalDateTime[]{s, e});
                }
                if (spans.isEmpty()) return null;
            }
            default -> { return null; }
        }

        long minutes = 0;
        for (LocalDateTime[] s : spans) minutes += Math.max(0, Duration.between(s[0], s[1]).toMinutes()) - excluded(r, date, s);
        if (minutes <= 0) return null;
        // 원본 순서: 제외시간(위) → 최대시간 → 반영단위 → 최소시간
        if (r.isHourUnit()) {
            int max = minutesOf(r.getMaxHours(), r.getMaxMinutes());
            if (max > 0 && minutes > max) minutes = max;
            int unit = minutesOf(r.getUnitHours(), r.getUnitMinutes());
            if (unit > 0) minutes = minutes / unit * unit;
        }
        int min = minutesOf(r.getMinHours(), r.getMinMinutes());
        if (min > 0 && minutes < min) return null;
        if (minutes <= 0) return null;
        if (!r.isHourUnit()) return BigDecimal.ONE.setScale(2);
        return BigDecimal.valueOf(minutes).divide(BigDecimal.valueOf(60), 2, RoundingMode.HALF_UP);
    }

    private static boolean dayMatches(CommuteRule r, LocalDate date) {
        int idx = date.getDayOfWeek().getValue() % 7; // 일 0 · 월 1 … 토 6
        String w = r.getWeekdays() == null ? "0111110" : r.getWeekdays();
        if (w.length() == 7 && w.charAt(idx) != '1') return false;
        // 업무일 · 휴일은 업무일 달력으로 가린다. 우리에게 그 달력이 없어 원본(달력 없는 회사)처럼 아무 날도 맞지 않는다.
        CommuteRuleDayKind kind = r.getDayKind() == null ? CommuteRuleDayKind.ALL : r.getDayKind();
        return kind == CommuteRuleDayKind.ALL;
    }

    /** 출근 · 퇴근을 차례로 짝짓는다(퇴근 뒤 재출근 '+1' 도 한 짝씩). 이력이 없으면 요약 줄의 첫 출근 · 첫 퇴근. */
    private static List<LocalDateTime[]> pairs(EmployeeCommute c, List<EmployeeCommuteEvent> evs) {
        List<LocalDateTime[]> out = new ArrayList<>();
        if (evs.isEmpty()) {
            if (c.getClockIn() != null && c.getClockOut() != null) out.add(new LocalDateTime[]{c.getClockIn(), c.getClockOut()});
            return out;
        }
        LocalDateTime open = null;
        for (EmployeeCommuteEvent e : evs) {
            if (e.isIn()) { if (open == null) open = e.getAt(); }
            else if (open != null) { out.add(new LocalDateTime[]{open, e.getAt()}); open = null; }
        }
        return out;
    }

    private static boolean within(CommuteRule r, LocalDate date, LocalDateTime t) {
        if (r.getHalfFrom() == null || r.getHalfTo() == null) return true;
        LocalDateTime hs = at(date, r.getHalfFrom(), DEFAULT_FROM);
        LocalDateTime he = at(date, r.getHalfTo(), DEFAULT_TO);
        return !t.isBefore(hs) && !t.isAfter(he);
    }

    private static long excluded(CommuteRule r, LocalDate date, LocalDateTime[] span) {
        long sum = 0;
        String[][] ex = {{r.getEx1From(), r.getEx1To()}, {r.getEx2From(), r.getEx2To()}, {r.getEx3From(), r.getEx3To()}};
        for (String[] x : ex) {
            if (x[0] == null || x[1] == null) continue;
            LocalDateTime s = max(at(date, x[0], null), span[0]);
            LocalDateTime e = min(at(date, x[1], null), span[1]);
            if (e.isAfter(s)) sum += Duration.between(s, e).toMinutes();
        }
        return sum;
    }

    /** 'D|HH:MM' (D 0 당일 · 1 익일) → 그 시각 */
    static LocalDateTime at(LocalDate date, String slot, LocalTime fallback) {
        if (slot == null || !slot.contains("|")) return date.atTime(fallback);
        String[] p = slot.split("\\|");
        return date.plusDays("1".equals(p[0]) ? 1 : 0).atTime(LocalTime.parse(p[1]));
    }

    /** 가까운 분으로 — 30초부터 올림(원본 10:30:25 → 10:30, 10:30:48 → 10:31). */
    static LocalDateTime roundMinute(LocalDateTime t) {
        LocalDateTime m = t.truncatedTo(ChronoUnit.MINUTES);
        return t.getSecond() >= 30 ? m.plusMinutes(1) : m;
    }

    /** 일별 줄의 적요 — 원본 '출근: 10:30 / 퇴근: 16:20', 퇴근이 없으면 '퇴근: 00:00'. */
    static String note(EmployeeCommute c, List<EmployeeCommuteEvent> evs) {
        LocalDateTime out = evs.stream().filter(e -> !e.isIn()).map(EmployeeCommuteEvent::getAt)
                .reduce((a, b) -> b).orElse(c.getClockOut());
        return "출근: " + hm(c.getClockIn()) + " / 퇴근: " + hm(out);
    }

    private static String hm(LocalDateTime t) {
        return t == null ? "00:00" : String.format("%02d:%02d", t.getHour(), t.getMinute());
    }

    private static int minutesOf(Integer h, Integer m) {
        return (h == null ? 0 : h) * 60 + (m == null ? 0 : m);
    }

    private static LocalDateTime max(LocalDateTime a, LocalDateTime b) { return a.isAfter(b) ? a : b; }

    private static LocalDateTime min(LocalDateTime a, LocalDateTime b) { return a.isBefore(b) ? a : b; }

    private static ReflectLine line(LocalDate date, Employee e, AttendanceKind k, BigDecimal amount, String note) {
        return new ReflectLine(date, e.getId(), e.getCode(), e.getName(),
                e.getDepartment() == null ? null : e.getDepartment().getName(), k.getId(), k.getCode(), k.getName(), amount, note);
    }
}
