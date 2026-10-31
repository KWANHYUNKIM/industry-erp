package com.erp.accounting.ledger.account;

/** 계정등록(E010107) 평가구분 — 원본 해당없음 · 평가계정대상 · 평가계정. */
public enum AccountEvalKind {
    NONE("해당없음"),
    TARGET("평가계정대상"),
    EVAL("평가계정");

    private final String displayName;

    AccountEvalKind(String displayName) { this.displayName = displayName; }

    public String getDisplayName() { return displayName; }
}
