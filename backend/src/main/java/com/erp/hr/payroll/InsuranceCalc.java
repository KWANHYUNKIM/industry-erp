package com.erp.hr.payroll;

/**
 * 원본 사원등록 [기타설정] 국민연금 칸 — '기준소득월액기준 / 안함'.
 * 건강 · 고용보험은 '보수월액기준' 이 하나 더 있어 {@link InsuranceBasis} 를 쓴다.
 */
public enum InsuranceCalc {
    /** 자동계산(국민연금은 기준소득월액기준) */
    AUTO,
    /** 안함 — 그 보험 공제 줄을 만들지 않는다 */
    NONE
}
