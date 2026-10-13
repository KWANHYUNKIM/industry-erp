package com.erp.accounting.paymentstatement;

/** 지급명세서파일생성 [자료반영기준] — 원본 기본 귀속연월. */
public enum PaymentStatementBasis {
    ATTRIBUTION("귀속연월"),
    PAYMENT("지급연월");

    private final String displayName;

    PaymentStatementBasis(String displayName) { this.displayName = displayName; }

    public String getDisplayName() { return displayName; }
}
