package com.erp.accounting.service;

import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.math.RoundingMode;

/**
 * 근로소득 원천징수 세액 계산.
 *
 * 실무의 「근로소득 간이세액표」는 급여구간 × 공제대상 가족수로 된 조회표다. 표를 그대로 싣는 대신
 * 그 표가 만들어진 계산식(연환산 → 근로소득공제 → 과세표준 → 누진세율 → 근로소득세액공제)을
 * 재현해 근사한다. 따라서 실제 간이세액표와 원 단위로 일치하지는 않는다. 연말정산에서
 * 정산되는 구조이므로 원천징수 단계의 근사는 허용된다.
 *
 * 공제대상 가족은 본인 1인으로 본다(사원 마스터에 부양가족 정보가 없다).
 * 부양가족이 있는 사원은 급여명세에서 소득세를 수동 공제 항목으로 조정한다.
 */
@Component
public class WithholdingTaxCalculator {

    private static final BigDecimal MONTHS = new BigDecimal("12");
    /** 기본공제 1인당 150만원 (본인) */
    private static final BigDecimal PERSONAL_DEDUCTION = new BigDecimal("1500000");
    /** 지방소득세 = 소득세의 10% */
    private static final BigDecimal LOCAL_RATE = new BigDecimal("0.10");

    /**
     * 월 소득세(원천징수분).
     *
     * @param monthlyTaxableIncome 월 과세소득 (기본급 + 과세수당)
     * @param monthlyPension       월 국민연금 근로자 부담분 (연금보험료공제 대상)
     */
    public BigDecimal monthlyIncomeTax(BigDecimal monthlyTaxableIncome, BigDecimal monthlyPension) {
        if (monthlyTaxableIncome == null || monthlyTaxableIncome.signum() <= 0) {
            return BigDecimal.ZERO;
        }
        BigDecimal grossYear = monthlyTaxableIncome.multiply(MONTHS);
        BigDecimal earnedIncome = grossYear.subtract(earnedIncomeDeduction(grossYear));

        BigDecimal pensionYear = monthlyPension != null ? monthlyPension.multiply(MONTHS) : BigDecimal.ZERO;
        BigDecimal taxBase = earnedIncome
                .subtract(PERSONAL_DEDUCTION)
                .subtract(pensionYear)
                .max(BigDecimal.ZERO);

        BigDecimal computed = progressiveTax(taxBase);
        BigDecimal determined = computed.subtract(earnedIncomeTaxCredit(computed, grossYear)).max(BigDecimal.ZERO);

        return determined.divide(MONTHS, 0, RoundingMode.HALF_UP);
    }

    /** 지방소득세 = 소득세의 10% (원 단위 절사) */
    public BigDecimal localIncomeTax(BigDecimal incomeTax) {
        if (incomeTax == null || incomeTax.signum() <= 0) return BigDecimal.ZERO;
        return incomeTax.multiply(LOCAL_RATE).setScale(0, RoundingMode.DOWN);
    }

    /** 근로소득공제 (한도 2,000만원) */
    private BigDecimal earnedIncomeDeduction(BigDecimal gross) {
        BigDecimal d;
        if (le(gross, "5000000")) {
            d = pct(gross, "0.70");
        } else if (le(gross, "15000000")) {
            d = bd("3500000").add(pct(gross.subtract(bd("5000000")), "0.40"));
        } else if (le(gross, "45000000")) {
            d = bd("7500000").add(pct(gross.subtract(bd("15000000")), "0.15"));
        } else if (le(gross, "100000000")) {
            d = bd("12000000").add(pct(gross.subtract(bd("45000000")), "0.05"));
        } else {
            d = bd("14750000").add(pct(gross.subtract(bd("100000000")), "0.02"));
        }
        return d.min(bd("20000000"));
    }

    /** 종합소득세 기본세율 (누진공제 대신 구간별 누적으로 계산) */
    private BigDecimal progressiveTax(BigDecimal base) {
        if (le(base, "14000000")) return pct(base, "0.06");
        if (le(base, "50000000")) return bd("840000").add(pct(base.subtract(bd("14000000")), "0.15"));
        if (le(base, "88000000")) return bd("6240000").add(pct(base.subtract(bd("50000000")), "0.24"));
        if (le(base, "150000000")) return bd("15360000").add(pct(base.subtract(bd("88000000")), "0.35"));
        if (le(base, "300000000")) return bd("37060000").add(pct(base.subtract(bd("150000000")), "0.38"));
        if (le(base, "500000000")) return bd("94060000").add(pct(base.subtract(bd("300000000")), "0.40"));
        if (le(base, "1000000000")) return bd("174060000").add(pct(base.subtract(bd("500000000")), "0.42"));
        return bd("384060000").add(pct(base.subtract(bd("1000000000")), "0.45"));
    }

    /** 근로소득세액공제: 산출세액 130만 이하 55%, 초과분 30%. 총급여 구간별 한도 적용. */
    private BigDecimal earnedIncomeTaxCredit(BigDecimal computedTax, BigDecimal gross) {
        BigDecimal credit;
        if (le(computedTax, "1300000")) {
            credit = pct(computedTax, "0.55");
        } else {
            credit = bd("715000").add(pct(computedTax.subtract(bd("1300000")), "0.30"));
        }
        BigDecimal limit;
        if (le(gross, "33000000")) {
            limit = bd("740000");
        } else if (le(gross, "70000000")) {
            limit = bd("660000");
        } else {
            limit = bd("500000");
        }
        return credit.min(limit);
    }

    private static BigDecimal bd(String v) {
        return new BigDecimal(v);
    }

    private static boolean le(BigDecimal v, String bound) {
        return v.compareTo(bd(bound)) <= 0;
    }

    private static BigDecimal pct(BigDecimal v, String rate) {
        return v.multiply(bd(rate));
    }
}
