package com.erp.accounting.withholding;

import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.math.RoundingMode;

/**
 * 근로소득 원천징수 세액 — <b>근로소득 간이세액표</b>(소득세법 시행령 [별표 2], 개정 2024.2.29.)를 그대로 찾는다.
 *
 * <p>예전엔 표 대신 계산식(근로소득공제 → 기본공제 → 누진세율 → 근로소득세액공제)으로 근사했는데,
 * 표가 반영하는 <b>특별소득공제·특별세액공제 일부</b>(총급여 구간별 310만+4% …)를 빠뜨려 세액이 크게 나왔다.
 * 월 320만 원(본인 1명)이 표 91,460원인데 140,825원 — 54% 더 떼고 있었다(36회차).
 * 근사를 다듬기보다 국세청 표를 그대로 싣는다: resources/tax/simplified-withholding-2024.csv (646구간 × 가족 1~11명).
 *
 * <p>월급여액 1,000만 원 초과는 표 밖의 계산식(별표 2 맨 끝)을 따른다. 77만 원 미만은 0.
 * 공제대상가족은 본인 1명으로 본다(사원 마스터에 부양가족 칸이 없다) — 다른 값이면 급여명세에서 소득세를 손으로 고친다.
 * 국민연금(monthlyPension)은 표가 이미 반영하므로 쓰지 않는다.
 */
@Component
public class WithholdingTaxCalculator {

    private static final BigDecimal LOCAL_RATE = new BigDecimal("0.10");

    /** [구간 하한(천원), 상한(천원), 가족1..11 세액] */
    private final java.util.List<long[]> rows = new java.util.ArrayList<>();
    private long[] top;   // 월급여액 10,000천원인 경우의 세액(가족 1..11)

    public WithholdingTaxCalculator() {
        try (var in = getClass().getResourceAsStream("/tax/simplified-withholding-2024.csv")) {
            if (in == null) throw new IllegalStateException("간이세액표 파일이 없습니다: /tax/simplified-withholding-2024.csv");
            for (String line : new String(in.readAllBytes(), java.nio.charset.StandardCharsets.UTF_8).split("\\R")) {
                if (line.isBlank() || line.startsWith("#")) continue;
                String[] c = line.split(",");
                long[] v = new long[13];
                if (c[0].equals("TOP")) {
                    top = new long[11];
                    for (int k = 0; k < 11; k++) top[k] = Long.parseLong(c[2 + k]);
                    continue;
                }
                for (int k = 0; k < 13; k++) v[k] = Long.parseLong(c[k]);
                rows.add(v);
            }
        } catch (java.io.IOException e) {
            throw new IllegalStateException("간이세액표를 읽지 못했습니다", e);
        }
    }

    /** 월 소득세(본인 1명). monthlyPension 은 표가 반영하므로 쓰지 않는다(호출부 호환용). */
    public BigDecimal monthlyIncomeTax(BigDecimal monthlyTaxableIncome, BigDecimal monthlyPension) {
        return monthlyIncomeTax(monthlyTaxableIncome, 1);
    }

    /** 월 소득세 — 간이세액표 조회. family 는 공제대상가족 수(본인 포함, 1~11). */
    public BigDecimal monthlyIncomeTax(BigDecimal monthlyTaxableIncome, int family) {
        if (monthlyTaxableIncome == null || monthlyTaxableIncome.signum() <= 0) return BigDecimal.ZERO;
        int col = Math.max(1, Math.min(family, 11)) - 1;
        long won = monthlyTaxableIncome.setScale(0, RoundingMode.DOWN).longValue();
        long thousand = won / 1000;
        if (thousand < 10_000) {
            for (long[] r : rows) {
                if (thousand >= r[0] && thousand < r[1]) return BigDecimal.valueOf(r[2 + col]);
            }
            return BigDecimal.ZERO;   // 770천원 미만
        }
        // 1,000만 원 이상 — 별표 2 의 표 밖 계산식(초과분 기준. 원 단위 미만 버림)
        BigDecimal base = BigDecimal.valueOf(top[col]);
        BigDecimal over10 = BigDecimal.valueOf(won - 10_000_000L);
        BigDecimal t;
        if (won <= 14_000_000L) {
            t = base.add(over10.multiply(bd("0.98")).multiply(bd("0.35"))).add(bd("25000"));
        } else if (won <= 28_000_000L) {
            t = base.add(bd("1397000")).add(BigDecimal.valueOf(won - 14_000_000L).multiply(bd("0.98")).multiply(bd("0.38")));
        } else if (won <= 30_000_000L) {
            t = base.add(bd("6610600")).add(BigDecimal.valueOf(won - 28_000_000L).multiply(bd("0.98")).multiply(bd("0.40")));
        } else if (won <= 45_000_000L) {
            t = base.add(bd("7394600")).add(BigDecimal.valueOf(won - 30_000_000L).multiply(bd("0.40")));
        } else if (won <= 87_000_000L) {
            t = base.add(bd("13394600")).add(BigDecimal.valueOf(won - 45_000_000L).multiply(bd("0.42")));
        } else {
            t = base.add(bd("31034600")).add(BigDecimal.valueOf(won - 87_000_000L).multiply(bd("0.45")));
        }
        return t.setScale(0, RoundingMode.DOWN);
    }

    /** 지방소득세 = 소득세의 10% (원 단위 절사) */
    public BigDecimal localIncomeTax(BigDecimal incomeTax) {
        if (incomeTax == null || incomeTax.signum() <= 0) return BigDecimal.ZERO;
        // 지방소득세도 10원 미만 버림 — 소득세 91,460 이면 9,146 이 아니라 9,140(QA 66회차).
        return incomeTax.multiply(LOCAL_RATE).divide(BigDecimal.TEN, 0, RoundingMode.DOWN).multiply(BigDecimal.TEN);
    }

    private static BigDecimal bd(String v) {
        return new BigDecimal(v);
    }

}
