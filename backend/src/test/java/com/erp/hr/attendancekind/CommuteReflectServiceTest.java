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
    void 지각_시간은_출근분을_올려_5_15() {
        assertEquals(new BigDecimal("5.15"), amount(rule(CommuteRuleMethod.LATE, true, true)));
    }

    @Test
    void 조퇴_시간은_퇴근분을_버려_3_82() {
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
}
