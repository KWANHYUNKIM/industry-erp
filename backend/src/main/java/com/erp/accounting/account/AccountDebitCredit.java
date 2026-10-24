package com.erp.accounting.account;

/** 계정등록(E010107) 대차구분 — 원본 차변 · 대변. */
public enum AccountDebitCredit {
    DEBIT("차변"),
    CREDIT("대변");

    private final String displayName;

    AccountDebitCredit(String displayName) { this.displayName = displayName; }

    public String getDisplayName() { return displayName; }
}
