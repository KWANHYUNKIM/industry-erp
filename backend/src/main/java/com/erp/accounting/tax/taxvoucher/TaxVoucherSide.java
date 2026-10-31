package com.erp.accounting.tax.taxvoucher;

/** (세금)계산서발행/수령의 매출/매입구분. */
public enum TaxVoucherSide {
    SALES("매출"),
    PURCHASE("매입");

    private final String displayName;

    TaxVoucherSide(String displayName) {
        this.displayName = displayName;
    }

    public String getDisplayName() {
        return displayName;
    }
}
