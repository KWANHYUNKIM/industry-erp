package com.erp.accounting.ledger.bond;

/** 원본 [증감구분] — 증가 · 감소. */
public enum BondDirection {
    INCREASE("증가"),
    DECREASE("감소");

    private final String displayName;

    BondDirection(String displayName) { this.displayName = displayName; }

    public String getDisplayName() { return displayName; }
}
