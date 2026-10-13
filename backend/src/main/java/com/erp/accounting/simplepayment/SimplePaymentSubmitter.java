package com.erp.accounting.simplepayment;

/** 간이지급명세서 제출자 */
public enum SimplePaymentSubmitter {
    DIRECT("직접제출"),
    AGENT("세무대리인");

    private final String displayName;

    SimplePaymentSubmitter(String displayName) { this.displayName = displayName; }

    public String getDisplayName() { return displayName; }
}
