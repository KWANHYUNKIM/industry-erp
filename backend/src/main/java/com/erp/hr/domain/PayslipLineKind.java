package com.erp.hr.domain;

/** 급여명세 라인 종류. */
public enum PayslipLineKind {
    ALLOWANCE("수당"),
    DEDUCTION("공제");

    private final String displayName;

    PayslipLineKind(String displayName) {
        this.displayName = displayName;
    }

    public String getDisplayName() {
        return displayName;
    }
}
