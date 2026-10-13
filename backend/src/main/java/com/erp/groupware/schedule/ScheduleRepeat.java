package com.erp.groupware.schedule;

import com.erp.common.ApiException;
import com.erp.groupware.schedule.dto.ScheduleEventDtos.RepeatRule;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.temporal.TemporalAdjusters;
import java.util.ArrayList;
import java.util.List;
import java.util.TreeSet;

/**
 * 원본 일정관리 [반복설정](E070201, 2026-10-13 실측)을 날짜 목록으로 펼친다.
 *
 * <p>반복주기 N + 단위: 일(N일마다) · 주(N주마다, 고른 요일들) · 개월(N개월마다 — 기준 '일'이면 그 일자,
 * '주'면 1~4번째 · 마지막 요일) · 년(N년마다 그 월 · 일). 시작일자부터 세고, 종료는 날짜(그날까지) 또는
 * 횟수(펼친 일정 수 — 원본 '매일, 10/13 부터 3회 까지' 가 13 · 14 · 15 세 칸이었다).
 * 없는 날(2월 30일)은 건너뛴다.
 */
public final class ScheduleRepeat {

    /** 한 번에 펼치는 최대 일정 수 — 끝없는 반복을 막는다. */
    static final int MAX = 500;

    private ScheduleRepeat() {}

    public static List<LocalDate> dates(RepeatRule r) {
        boolean byCount = "COUNT".equals(r.endType());
        if (byCount && (r.count() == null || r.count() < 1)) throw ApiException.badRequest("반복 횟수를 입력 바랍니다.");
        if (!byCount && r.endDate() == null) throw ApiException.badRequest("반복 종료일자를 입력 바랍니다.");
        if (!byCount && r.endDate().isBefore(r.startDate())) throw ApiException.badRequest("종료일자가 시작일자보다 빠릅니다.");
        int limit = byCount ? Math.min(r.count(), MAX) : MAX;
        int step = Math.max(1, r.interval());
        LocalDate start = r.startDate();
        List<LocalDate> out = new ArrayList<>();
        for (int k = 0; k < 2400 && out.size() < limit; k++) {
            for (LocalDate d : candidates(r, start, (long) k * step)) {
                if (d.isBefore(start)) continue;
                if (!byCount && d.isAfter(r.endDate())) return out;
                out.add(d);
                if (out.size() >= limit) return out;
            }
        }
        return out;
    }

    private static TreeSet<LocalDate> candidates(RepeatRule r, LocalDate start, long n) {
        TreeSet<LocalDate> c = new TreeSet<>();
        switch (r.unit()) {
            case "DAY" -> c.add(start.plusDays(n));
            case "WEEK" -> {
                LocalDate sunday = start.with(TemporalAdjusters.previousOrSame(DayOfWeek.SUNDAY)).plusWeeks(n);
                List<Integer> days = r.weekdays() == null || r.weekdays().isEmpty()
                        ? List.of(start.getDayOfWeek().getValue() % 7) : r.weekdays();
                for (int w : days) c.add(sunday.plusDays(w));
            }
            case "MONTH" -> {
                YearMonth ym = YearMonth.from(start).plusMonths(n);
                if ("WEEK".equals(r.monthBasis())) {
                    List<Integer> days = r.weekdays() == null || r.weekdays().isEmpty()
                            ? List.of(start.getDayOfWeek().getValue() % 7) : r.weekdays();
                    int ord = r.weekOrdinal() == null ? 1 : r.weekOrdinal();
                    for (int w : days) {
                        DayOfWeek dow = DayOfWeek.of(w == 0 ? 7 : w);
                        LocalDate d = ord >= 5
                                ? ym.atEndOfMonth().with(TemporalAdjusters.lastInMonth(dow))
                                : ym.atDay(1).with(TemporalAdjusters.dayOfWeekInMonth(ord, dow));
                        if (YearMonth.from(d).equals(ym)) c.add(d);
                    }
                } else {
                    int day = r.monthDay() == null ? start.getDayOfMonth() : r.monthDay();
                    if (day >= 1 && day <= ym.lengthOfMonth()) c.add(ym.atDay(day));
                }
            }
            case "YEAR" -> {
                int year = start.getYear() + (int) n;
                int month = r.yearMonth() == null ? start.getMonthValue() : r.yearMonth();
                int day = r.yearDay() == null ? start.getDayOfMonth() : r.yearDay();
                YearMonth ym = YearMonth.of(year, month);
                if (day >= 1 && day <= ym.lengthOfMonth()) c.add(ym.atDay(day));
            }
            default -> throw ApiException.badRequest("반복 단위가 올바르지 않습니다: " + r.unit());
        }
        return c;
    }
}
