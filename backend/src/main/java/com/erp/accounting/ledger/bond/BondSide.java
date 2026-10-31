package com.erp.accounting.ledger.bond;

/** 채권관리(받을 돈) · 채무관리(줄 돈). 원본은 메뉴가 둘로 갈라져 있고 화면 구성은 같다. */
public enum BondSide {
    RECEIVABLE("채권"),
    PAYABLE("채무");

    private final String displayName;

    BondSide(String displayName) { this.displayName = displayName; }

    public String getDisplayName() { return displayName; }
}
