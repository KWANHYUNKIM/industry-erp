package com.erp.accounting.fund.fundplan;

/** 원본 [입출구분] — 출금 · 입금. */
public enum FundPlanDirection {
    OUT("출금"),
    IN("입금");

    private final String displayName;

    FundPlanDirection(String displayName) { this.displayName = displayName; }

    public String getDisplayName() { return displayName; }
}
