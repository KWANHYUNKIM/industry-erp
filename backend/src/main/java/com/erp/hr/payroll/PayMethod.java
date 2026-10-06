package com.erp.hr.payroll;

/** 원본 수당항목등록(E090103)의 <b>[지급유형]</b> — 드롭다운 다섯 개 그대로. */
public enum PayMethod {
    FIXED("고정"),
    DAILY("변동(일)"),
    HOURLY("변동(시간)"),
    RATE("변동(지급률)"),
    MANUAL("변동(직접입력)");

    private final String displayName;

    PayMethod(String displayName) {
        this.displayName = displayName;
    }

    public String getDisplayName() {
        return displayName;
    }
}
