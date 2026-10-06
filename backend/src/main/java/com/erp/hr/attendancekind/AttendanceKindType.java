package com.erp.hr.attendancekind;

/** 원본 근태항목등록 [근태유형] 라디오 — 기본 · 휴가 · 출/퇴근. */
public enum AttendanceKindType {
    BASIC("기본"),
    VACATION("휴가"),
    COMMUTE("출/퇴근");

    private final String displayName;

    AttendanceKindType(String displayName) {
        this.displayName = displayName;
    }

    public String getDisplayName() {
        return displayName;
    }
}
