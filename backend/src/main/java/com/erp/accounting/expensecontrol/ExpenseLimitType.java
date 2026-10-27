package com.erp.accounting.expensecontrol;

/** 통제유형 [한도구분] — 원본 E060808 라디오 차례. 통제유형이 없는 비용은 원본 목록에 '총금액' 으로 보인다. */
public enum ExpenseLimitType {
    PERSONAL_SAME("개인별(동일금액)"),
    PERSONAL_EACH("개인별(별도금액)"),
    TOTAL("총금액");

    private final String displayName;

    ExpenseLimitType(String displayName) { this.displayName = displayName; }

    public String getDisplayName() { return displayName; }
}
