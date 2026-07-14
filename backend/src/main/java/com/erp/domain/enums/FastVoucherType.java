package com.erp.domain.enums;

/** FastEntry 간편전표 종류. */
public enum FastVoucherType {
    EXPENSE_REPORT("지출결의서"),
    DEPOSIT_REPORT("입금보고서"),
    ADVANCE_SETTLEMENT("가지급금정산서");

    private final String displayName;

    FastVoucherType(String displayName) {
        this.displayName = displayName;
    }

    public String getDisplayName() {
        return displayName;
    }
}
