package com.erp.hr.attendancekind;

import com.erp.hr.employeecommute.EmployeeCommute;
import com.erp.hr.employeecommute.EmployeeCommuteEvent;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

/** 원본 2026-10-13 실측값 — 출근 14:08:35 · 퇴근 14:11:29, 직접설정 기준시간 09:00~18:00. */
class CommuteReflectServiceTest {

    private static final LocalDate DAY = LocalDate.of(2026, 10, 13); // 화요일
    private static final LocalDateTime IN = DAY.atTime(14, 8, 35);
    private static final LocalDateTime OUT = DAY.atTime(14, 11, 29);

    private static CommuteRule rule(CommuteRuleMethod m, boolean hourUnit, boolean direct) {
        return CommuteRule.builder().code("T").name("T").method(m).hourUnit(hourUnit).directBasis(direct)
                .baseFrom("0|09:00").baseTo("0|18:00").halfFrom("0|09:00").halfTo("0|18:00").halfUse(true)
                .weekdays("0111110").dayKind(CommuteRuleDayKind.ALL).active(true).build();
    }

    private static EmployeeCommute commute() {
        return EmployeeCommute.builder().workDate(DAY).clockIn(IN).clockOut(OUT).build();
    }

    private static List<EmployeeCommuteEvent> events(EmployeeCommute c) {
        return List.of(EmployeeCommuteEvent.builder().commute(c).kind(EmployeeCommuteEvent.IN).at(IN).build(),
                EmployeeCommuteEvent.builder().commute(c).kind(EmployeeCommuteEvent.OUT).at(OUT).build());
    }

    private static BigDecimal amount(CommuteRule r) {
        EmployeeCommute c = commute();
        return CommuteReflectService.amount(r, c, events(c));
    }

    @Test
    void 지각_일은_1() {
        assertEquals(new BigDecimal("1.00"), amount(rule(CommuteRuleMethod.LATE, false, true)));
    }

    @Test
    void 지각_시간은_출근을_가까운_분으로_5_15() {
        assertEquals(new BigDecimal("5.15"), amount(rule(CommuteRuleMethod.LATE, true, true)));
    }

    @Test
    void 조퇴_시간은_퇴근을_가까운_분으로_3_82() {
        assertEquals(new BigDecimal("3.82"), amount(rule(CommuteRuleMethod.EARLY_LEAVE, true, true)));
    }

    @Test
    void 근무시간_시간은_0_03() {
        assertEquals(new BigDecimal("0.03"), amount(rule(CommuteRuleMethod.WORK_TIME, true, true)));
    }

    @Test
    void 근무시간설정기준은_반영하지_않는다() {
        assertNull(amount(rule(CommuteRuleMethod.LATE, false, false)));
    }

    @Test
    void 반영단위_나머지는_버린다() {
        CommuteRule r = rule(CommuteRuleMethod.LATE, true, true);
        r.setUnitMinutes(30); // 309분 → 300분
        assertEquals(new BigDecimal("5.00"), amount(r));
    }

    @Test
    void 요일에_없는_날은_반영하지_않는다() {
        CommuteRule r = rule(CommuteRuleMethod.LATE, false, true);
        r.setWeekdays("0101110"); // 화요일 빼기
        assertNull(amount(r));
    }

    // ---- 2026-10-13 2차 실측: 10/05(월) 출근 10:30:25 · 퇴근 16:20:24, 직접설정 09:00~18:00 · 시간 ----
    private static final LocalDate MON = LocalDate.of(2026, 10, 5);

    private static BigDecimal late(CommuteRule r, LocalDateTime in) {
        EmployeeCommute c = EmployeeCommute.builder().workDate(in.toLocalDate()).clockIn(in).build();
        return CommuteReflectService.amount(r, c, List.of(EmployeeCommuteEvent.builder().commute(c).kind(EmployeeCommuteEvent.IN).at(in).build()));
    }

    private static CommuteRule lateHour() {
        CommuteRule r = rule(CommuteRuleMethod.LATE, true, true);
        r.setWeekdays("0111111");
        return r;
    }

    @Test
    void 초는_가까운_분으로_반올림한다() {
        assertEquals(new BigDecimal("1.50"), late(lateHour(), MON.atTime(10, 30, 25)));          // 90분
        assertEquals(new BigDecimal("1.52"), late(lateHour(), MON.plusDays(5).atTime(10, 30, 48))); // 토 91분
    }

    @Test
    void 제외시간을_뺀_뒤_최대시간() {
        CommuteRule r = lateHour();
        r.setEx1From("0|10:00"); r.setEx1To("0|10:20"); r.setMaxHours(1); r.setMaxMinutes(0);
        assertEquals(new BigDecimal("1.00"), late(r, MON.atTime(10, 30, 25)));
    }

    @Test
    void 제외시간을_뺀_뒤_최소시간() {
        CommuteRule r = lateHour();
        r.setEx1From("0|10:00"); r.setEx1To("0|10:20"); r.setMinHours(1); r.setMinMinutes(15);
        assertNull(late(r, MON.atTime(10, 30, 25))); // 70 < 75
    }

    @Test
    void 반영단위_뒤에_최소시간() {
        CommuteRule r = lateHour();
        r.setUnitMinutes(40);
        assertEquals(new BigDecimal("1.33"), late(r, MON.atTime(10, 30, 25))); // 90 → 80
        r.setMinHours(1); r.setMinMinutes(25);
        assertNull(late(r, MON.atTime(10, 30, 25))); // 80 < 85
    }

    @Test
    void 최대시간_뒤에_반영단위() {
        CommuteRule r = lateHour();
        r.setUnitMinutes(40); r.setMaxHours(1); r.setMaxMinutes(0);
        assertEquals(new BigDecimal("0.67"), late(r, MON.atTime(10, 30, 25))); // 90 → 60 → 40
    }

    @Test
    void 업무일_휴일은_달력이_없어_반영하지_않는다() {
        CommuteRule r = lateHour();
        r.setDayKind(CommuteRuleDayKind.WORKDAY);
        assertNull(late(r, MON.atTime(10, 30, 25)));
        r.setDayKind(CommuteRuleDayKind.HOLIDAY);
        assertNull(late(r, MON.plusDays(5).atTime(10, 30, 48)));
    }

    @Test
    void 일별_적요() {
        EmployeeCommute c = EmployeeCommute.builder().workDate(MON).clockIn(MON.atTime(10, 30, 25)).build();
        assertEquals("출근: 10:30 / 퇴근: 00:00", CommuteReflectService.note(c, List.of()));
    }
}
