package com.erp.accounting.expensecontrol;

/** 통제유형 [통제알림방식] — 원본 E060808: 사용안함 · 경고 및 알림(기본) · 저장불가. */
public enum ExpenseNoticeType {
    NONE("사용안함"),
    WARN("경고 및 알림"),
    BLOCK("저장불가");

    private final String displayName;

    ExpenseNoticeType(String displayName) { this.displayName = displayName; }

    public String getDisplayName() { return displayName; }
}
