package com.erp.hr.attendancekind;

/** 원본 출/퇴근반영기준 직접설정 [업무일/휴일] — 전체 · 업무일 · 휴일. */
public enum CommuteRuleDayKind {
    ALL("전체"),
    WORKDAY("업무일"),
    HOLIDAY("휴일");

    private final String displayName;

    CommuteRuleDayKind(String displayName) {
        this.displayName = displayName;
    }

    public String getDisplayName() {
        return displayName;
    }
}
