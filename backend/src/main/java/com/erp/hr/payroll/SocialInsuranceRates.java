package com.erp.hr.payroll;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.YearMonth;

/**
 * 4대보험 <b>근로자 부담</b> 요율 — 귀속월에 따라 다르다.
 *
 * <p>예전엔 2025년 요율(국민연금 4.5% · 건강 3.545% · 장기요양 12.95%)을 상수로 박아 둬서,
 * 2026년 급여에도 옛 요율로 공제했다(36회차). 2026년부터 국민연금은 연금개혁으로 9.5%(근로자 4.75%),
 * 그 뒤 해마다 0.5%p씩 올라 2033년 13%(근로자 6.5%)에서 멈춘다. 건강보험은 2026년 7.19%(근로자 3.595%),
 * 장기요양은 2026년 0.9448% = 건강보험료의 13.14%. 2027년 이후 건강·장기요양은 아직 고시 전이라 2026년 값을 쓴다
 * — 고시되면 여기에 한 줄 더한다.
 *
 * <p>국민연금은 <b>기준소득월액 상·하한</b>이 있다. 상한을 넘는 소득에 요율을 곱하면 고소득자가 더 낸다.
 * 매년 7월에 바뀐다: 2024.7~ 39만~617만, 2025.7~ 40만~637만, 2026.7~ 41만~659만.
 *
 * <p>근거: 보건복지부·국민연금공단 고시(2025.3 연금개혁, 2026년 기준소득월액 조정),
 * 건강보험정책심의위원회 2026년 보험료율 결정. 원 단위 반올림은 그대로(회사 정책마다 절사 단위가 다르다).
 */
public final class SocialInsuranceRates {

    private SocialInsuranceRates() {}

    /** 국민연금 근로자 부담률. 2025 4.5% → 2026 4.75% → 해마다 +0.25%p → 2033 6.5% 에서 멈춤. */
    public static BigDecimal pension(YearMonth ym) {
        int y = ym.getYear();
        if (y <= 2025) return new BigDecimal("0.045");
        int steps = Math.min(y, 2033) - 2025;                        // 2026 → 1
        return new BigDecimal("0.045").add(new BigDecimal("0.0025").multiply(BigDecimal.valueOf(steps)));
    }

    /** 건강보험 근로자 부담률. */
    public static BigDecimal health(YearMonth ym) {
        return ym.getYear() <= 2025 ? new BigDecimal("0.03545") : new BigDecimal("0.03595");
    }

    /** 장기요양보험료 = 건강보험료 × 이 비율. */
    public static BigDecimal longTermCareOfHealth(YearMonth ym) {
        return ym.getYear() <= 2025 ? new BigDecimal("0.1295") : new BigDecimal("0.1314");
    }

    /** 고용보험 근로자 부담률(실업급여분). */
    public static BigDecimal employment(YearMonth ym) {
        return new BigDecimal("0.009");
    }

    /** 국민연금 기준소득월액 — 과세소득을 그 기간의 상·하한 안으로 자른다. */
    public static BigDecimal pensionBase(BigDecimal taxableIncome, YearMonth ym) {
        long lo;
        long hi;
        if (ym.isBefore(YearMonth.of(2025, 7))) { lo = 390_000; hi = 6_170_000; }
        else if (ym.isBefore(YearMonth.of(2026, 7))) { lo = 400_000; hi = 6_370_000; }
        else { lo = 410_000; hi = 6_590_000; }
        BigDecimal v = taxableIncome.max(BigDecimal.valueOf(lo)).min(BigDecimal.valueOf(hi));
        // 소득이 0 이면(무급 달) 하한으로 올려 공제하지 않는다
        return taxableIncome.signum() <= 0 ? BigDecimal.ZERO : v.setScale(0, RoundingMode.DOWN);
    }
}
