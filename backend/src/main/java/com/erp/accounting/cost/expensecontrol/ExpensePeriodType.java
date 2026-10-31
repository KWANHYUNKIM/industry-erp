package com.erp.accounting.cost.expensecontrol;

/** 통제유형 [기간] — 원본 통제유형등록(E060808) ▾ 차례 그대로. */
public enum ExpensePeriodType {
    DESIGNATED("지정기간"),
    DAILY("매일반복"),
    WEEKLY("매주반복"),
    MONTHLY("매월반복"),
    YEARLY("매년반복"),
    EACH("매회반복");

    private final String displayName;

    ExpensePeriodType(String displayName) { this.displayName = displayName; }

    public String getDisplayName() { return displayName; }
}
