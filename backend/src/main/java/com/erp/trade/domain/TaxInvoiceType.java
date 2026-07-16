package com.erp.trade.domain;

/** 세금계산서 종류. */
public enum TaxInvoiceType {
    SALES("매출"),
    PURCHASE("매입");

    private final String displayName;

    TaxInvoiceType(String displayName) {
        this.displayName = displayName;
    }

    public String getDisplayName() {
        return displayName;
    }
}
