package com.erp.accounting.domain.enums;

/** 자금 흐름 방향. */
public enum CashFlowType {
    INFLOW("수입"),
    OUTFLOW("지출");

    private final String displayName;

    CashFlowType(String displayName) {
        this.displayName = displayName;
    }

    public String getDisplayName() {
        return displayName;
    }
}
