package com.erp.hr.payroll;

/**
 * 원본 수당항목등록(E090103)의 <b>[비과세유형]</b>. 전액과세가 아니면 그 수당은 과세소득에서 빠진다.
 * 2026-10-03 loginaa 수당리스트에 쓰인 유형만 둔다(원본 코드도움에는 더 있다).
 *
 * <p><b>월 한도</b>(2026-10-13 원본 급여대장 실측): 비과세는 유형마다 한 달 한도까지만 빠지고 넘는 몫은 과세다.
 * 원본 변종호 — 연차수당(비과세유형 보육수당) 360,000 중 200,000 만 비과세라 과세급여 4,259,000(= 지급총액 4,759,000
 * − 식대 100,000 − 차량유지비 200,000 − 200,000). 야근수당(야간근로수당) 171,000 은 전부 과세였다 — 야간근로 비과세는
 * 생산직 · 월정액 210만 원 이하만인데 우리 사원에 그 구분이 없어 한도 0(늘 과세)으로 둔다.
 */
public enum PayTaxFreeType {
    NONE("전액과세", null),
    NIGHT_WORK("야간근로수당", java.math.BigDecimal.ZERO),
    CHILDCARE("보육수당", java.math.BigDecimal.valueOf(200_000)),
    MEAL("식대", java.math.BigDecimal.valueOf(200_000)),
    VEHICLE("차량유지비", java.math.BigDecimal.valueOf(200_000));

    private final String displayName;
    /** 한 달 비과세 한도. null 이면 한도 없음(전액 비과세 — 유형 없이 비과세로 넣은 줄). */
    private final java.math.BigDecimal monthlyLimit;

    PayTaxFreeType(String displayName, java.math.BigDecimal monthlyLimit) {
        this.displayName = displayName;
        this.monthlyLimit = monthlyLimit;
    }

    public java.math.BigDecimal getMonthlyLimit() {
        return monthlyLimit;
    }

    public String getDisplayName() {
        return displayName;
    }
}
