package com.erp.accounting.tax.vatreturn;

/** 부가세신고서 [신고구분]. */
public enum VatFilingType {
    REGULAR("정기신고"),
    LATE("기한후신고");

    private final String displayName;

    VatFilingType(String displayName) {
        this.displayName = displayName;
    }

    public String getDisplayName() {
        return displayName;
    }
}
