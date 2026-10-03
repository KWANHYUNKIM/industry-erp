package com.erp.hr.attendancekind;

/** 원본 출/퇴근반영기준 [반영방식] — 근무/추가근무시간 · 지각 · 조퇴 · 계산식. */
public enum CommuteRuleMethod {
    WORK_TIME("근무/추가근무시간"),
    LATE("지각"),
    EARLY_LEAVE("조퇴"),
    FORMULA("계산식");

    private final String displayName;

    CommuteRuleMethod(String displayName) {
        this.displayName = displayName;
    }

    public String getDisplayName() {
        return displayName;
    }
}
