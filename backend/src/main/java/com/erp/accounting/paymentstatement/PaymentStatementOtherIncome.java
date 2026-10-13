package com.erp.accounting.paymentstatement;

/** 지급명세서파일생성 [기타소득] — 원본 기본 포함. */
public enum PaymentStatementOtherIncome {
    INCLUDE("포함"),
    EXCLUDE("미포함"),
    PARTIAL("일부포함");

    private final String displayName;

    PaymentStatementOtherIncome(String displayName) { this.displayName = displayName; }

    public String getDisplayName() { return displayName; }
}
