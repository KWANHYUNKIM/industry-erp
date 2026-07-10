package com.erp.domain;

/** 계정 구분(대분류). */
public enum AccountDivision {
    ASSET("자산"),
    LIABILITY("부채"),
    EQUITY("자본"),
    REVENUE("수익"),
    EXPENSE("비용");

    private final String displayName;

    AccountDivision(String displayName) {
        this.displayName = displayName;
    }

    public String getDisplayName() {
        return displayName;
    }
}
