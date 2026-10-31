package com.erp.accounting.ledger.account;

/** 계정등록(E010107) 수입지출구분 — 원본 라디오 수입 · 지출 · 예금 · 없음. */
public enum AccountCashFlowKind {
    NONE("없음"),
    INCOME("수입"),
    EXPENSE("지출"),
    DEPOSIT("예금");

    private final String displayName;

    AccountCashFlowKind(String displayName) { this.displayName = displayName; }

    public String getDisplayName() { return displayName; }
}
