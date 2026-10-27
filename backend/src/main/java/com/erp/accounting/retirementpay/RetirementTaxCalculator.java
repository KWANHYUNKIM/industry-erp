package com.erp.accounting.retirementpay;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.Year;
import java.time.YearMonth;
import java.time.temporal.ChronoUnit;

/**
 * 퇴직금 · 퇴직소득세 셈. 상태가 없는 순수 함수만 둔다.
 *
 * <p>원본(E030117) 2026-10-03 실측 한 건으로 맞췄다 — 김은빈 기산일 2025-01-01 · 퇴사일 2026-09-10:
 * 3개월 급여 15,400,000 + 상여 2,000,000×3/12 = 15,900,000 / 92일 → 1일 평균 172,826.09 × 30 × 618일 / 365
 * = 8,778,618. 근속 21개월 → 2년, 근속연수공제 2,000,000, 환산급여 40,671,708, 환산급여별공제 27,603,024,
 * 과세표준 13,068,684, 환산산출세액 784,121, 산출세액 130,686 → 원천징수 소득세 130,680 · 지방소득세 13,060(10원 미만 버림).
 */
public final class RetirementTaxCalculator {

    private RetirementTaxCalculator() {}

    private static final BigDecimal TWELVE = BigDecimal.valueOf(12);

    /** 3개월 근무일수 — 퇴사일 3개월 전 날부터 퇴사일 전날까지(원본 9/10 퇴사 → 6/10~9/9 = 92일). */
    public static int workDays3m(LocalDate retireDate) {
        return (int) ChronoUnit.DAYS.between(retireDate.minusMonths(3), retireDate);
    }

    /** 재직일수 — 기산일부터 퇴사일까지 양끝 포함(원본 2025-01-01 ~ 2026-09-10 = 618일). */
    public static int serviceDays(LocalDate startDate, LocalDate retireDate) {
        return (int) ChronoUnit.DAYS.between(startDate, retireDate) + 1;
    }

    /** 근속월수 — 기산월부터 퇴사월까지, 걸친 달은 한 달로(원본 2025-01 ~ 2026-09 = 21). */
    public static int serviceMonths(LocalDate startDate, LocalDate retireDate) {
        return (int) ChronoUnit.MONTHS.between(YearMonth.from(startDate), YearMonth.from(retireDate)) + 1;
    }

    /** 근속연수 — 1년 미만은 1년으로 올린다. */
    public static int serviceYears(int serviceMonths) {
        return Math.max(1, (serviceMonths + 11) / 12);
    }

    /** 퇴직산출액 = (3개월 임금총액 / 3개월 근무일수) × 30 × 재직일수 / 365(퇴사한 해가 윤년이면 366). 원 미만 버림. */
    public static BigDecimal retirementPay(BigDecimal wageTotal3m, int workDays3m, int serviceDays, LocalDate retireDate) {
        if (workDays3m <= 0 || wageTotal3m.signum() <= 0) return BigDecimal.ZERO;
        int yearDays = Year.isLeap(retireDate.getYear()) ? 366 : 365;
        return wageTotal3m.multiply(BigDecimal.valueOf(30L * serviceDays))
                .divide(BigDecimal.valueOf((long) workDays3m * yearDays), 0, RoundingMode.DOWN);
    }

    /** 근속연수공제(2023년 이후 지급분). */
    public static BigDecimal serviceDeduction(int years) {
        long won;
        if (years <= 5) won = 1_000_000L * years;
        else if (years <= 10) won = 5_000_000L + 2_000_000L * (years - 5);
        else if (years <= 20) won = 15_000_000L + 2_500_000L * (years - 10);
        else won = 40_000_000L + 3_000_000L * (years - 20);
        return BigDecimal.valueOf(won);
    }

    /** 환산급여별공제. */
    public static BigDecimal convertedDeduction(BigDecimal converted) {
        long c = converted.longValue();
        BigDecimal v;
        if (c <= 8_000_000L) v = converted;
        else if (c <= 70_000_000L) v = rate(8_000_000L, converted, 8_000_000L, "0.60");
        else if (c <= 100_000_000L) v = rate(45_200_000L, converted, 70_000_000L, "0.55");
        else if (c <= 300_000_000L) v = rate(61_700_000L, converted, 100_000_000L, "0.45");
        else v = rate(151_700_000L, converted, 300_000_000L, "0.35");
        return v.setScale(0, RoundingMode.DOWN);
    }

    /** 종합소득세 기본세율(2023년 이후). */
    public static BigDecimal basicTax(BigDecimal base) {
        long b = base.longValue();
        BigDecimal v;
        if (b <= 14_000_000L) v = base.multiply(new BigDecimal("0.06"));
        else if (b <= 50_000_000L) v = rate(840_000L, base, 14_000_000L, "0.15");
        else if (b <= 88_000_000L) v = rate(6_240_000L, base, 50_000_000L, "0.24");
        else if (b <= 150_000_000L) v = rate(15_360_000L, base, 88_000_000L, "0.35");
        else if (b <= 300_000_000L) v = rate(37_060_000L, base, 150_000_000L, "0.38");
        else if (b <= 500_000_000L) v = rate(94_060_000L, base, 300_000_000L, "0.40");
        else if (b <= 1_000_000_000L) v = rate(174_060_000L, base, 500_000_000L, "0.42");
        else v = rate(384_060_000L, base, 1_000_000_000L, "0.45");
        return v.setScale(0, RoundingMode.DOWN);
    }

    private static BigDecimal rate(long fixed, BigDecimal amount, long over, String r) {
        return BigDecimal.valueOf(fixed).add(amount.subtract(BigDecimal.valueOf(over)).multiply(new BigDecimal(r)));
    }

    /** 퇴직소득세 계산 과정 — 원본 서식 (28) ~ (34) 그리고 원천징수할 소득세 · 지방소득세(10원 미만 버림). */
    public record Tax(BigDecimal income, BigDecimal serviceDeduction, BigDecimal converted, BigDecimal convertedDeduction,
                      BigDecimal taxBase, BigDecimal convertedTax, BigDecimal computedTax,
                      BigDecimal incomeTax, BigDecimal localIncomeTax) {}

    public static Tax tax(BigDecimal taxablePay, int serviceYears) {
        BigDecimal income = taxablePay.max(BigDecimal.ZERO).setScale(0, RoundingMode.DOWN);
        BigDecimal sd = serviceDeduction(serviceYears).min(income);
        BigDecimal years = BigDecimal.valueOf(serviceYears);
        BigDecimal converted = income.subtract(sd).multiply(TWELVE).divide(years, 0, RoundingMode.DOWN);
        BigDecimal cd = convertedDeduction(converted);
        BigDecimal base = converted.subtract(cd).max(BigDecimal.ZERO);
        BigDecimal convertedTax = basicTax(base);
        BigDecimal computed = convertedTax.multiply(years).divide(TWELVE, 0, RoundingMode.DOWN);
        BigDecimal local = computed.divide(BigDecimal.TEN, 0, RoundingMode.DOWN);
        return new Tax(income, sd, converted, cd, base, convertedTax, computed, tens(computed), tens(local));
    }

    /** 원천징수세액은 10원 미만을 버린다(원본 130,686 → 130,680 · 13,068 → 13,060). */
    private static BigDecimal tens(BigDecimal v) {
        return v.divide(BigDecimal.TEN, 0, RoundingMode.DOWN).multiply(BigDecimal.TEN);
    }
}
