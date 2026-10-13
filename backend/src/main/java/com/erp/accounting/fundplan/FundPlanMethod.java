package com.erp.accounting.fundplan;

/** 원본 [입력구분] 라디오 — 예금(현금) · 어음. 목록 [입력구분] 열에는 '자금' · '어음'으로 찍힌다. */
public enum FundPlanMethod {
    DEPOSIT("예금(현금)"),
    NOTE("어음");

    private final String displayName;

    FundPlanMethod(String displayName) { this.displayName = displayName; }

    public String getDisplayName() { return displayName; }
}
