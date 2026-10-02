package com.erp.hr.attendance;

import java.time.Duration;
import java.time.LocalTime;

/**
 * 출퇴근 시각 → <b>실근무 분</b>. 점심 휴게(12:00~13:00)와 겹치는 만큼 뺀다.
 *
 * <p>예전엔 퇴근 − 출근을 그대로 근무시간으로 써서 09:00~18:00 이 9시간으로 잡혔다(37회차).
 * 근로기준법 제54조는 8시간 근무에 1시간 이상 휴게를 주게 하고, 휴게는 근로시간이 아니다.
 * 회사마다 휴게 시각이 다르지만 대부분 12~13시라 그것으로 둔다 — 그 시각에 걸리지 않게
 * 오후에만 일한 날(13:00~18:00)은 빼지 않는다.
 *
 * <p>근태(출퇴근)를 보는 두 응답(근무현황 HrDtos · 출퇴근 AttendanceDtos)이 이 한 곳을 쓴다.
 */
public final class WorkTime {

    public static final LocalTime LUNCH_START = LocalTime.of(12, 0);
    public static final LocalTime LUNCH_END = LocalTime.of(13, 0);

    private WorkTime() {}

    /** 실근무 분. 출근·퇴근 중 하나라도 없으면 null. */
    public static Integer workMinutes(LocalTime in, LocalTime out) {
        if (in == null || out == null) return null;
        long span = Duration.between(in, out).toMinutes();
        if (span <= 0) return 0;
        LocalTime s = in.isAfter(LUNCH_START) ? in : LUNCH_START;
        LocalTime e = out.isBefore(LUNCH_END) ? out : LUNCH_END;
        long lunch = e.isAfter(s) ? Duration.between(s, e).toMinutes() : 0;
        return (int) (span - lunch);
    }
}
