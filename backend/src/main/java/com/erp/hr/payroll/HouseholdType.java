package com.erp.hr.payroll;

/** 원본 사원등록 [기타설정] 세대주여부 — 세대주 · 세대원 · 세대주의 배우자. 급여 셈에는 쓰이지 않는다(2026-10-13 실측). */
public enum HouseholdType {
    HEAD, MEMBER, HEAD_SPOUSE
}
