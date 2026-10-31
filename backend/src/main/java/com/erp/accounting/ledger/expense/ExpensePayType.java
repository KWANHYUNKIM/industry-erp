package com.erp.accounting.ledger.expense;

/** 원본 비용내역입력 머리의 [결제구분] — 개인비용(사원이 먼저 낸 돈) · 회사비용. */
public enum ExpensePayType {
    PERSONAL("개인비용"),
    COMPANY("회사비용");

    private final String displayName;

    ExpensePayType(String displayName) { this.displayName = displayName; }

    public String getDisplayName() { return displayName; }
}
