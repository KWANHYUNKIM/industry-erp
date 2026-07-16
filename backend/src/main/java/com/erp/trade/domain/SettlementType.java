package com.erp.trade.domain;

/** 정산 유형. 수금(매출처로부터 받음)/지급(매입처에 줌). */
public enum SettlementType {
    RECEIPT("수금"),
    PAYMENT("지급");

    private final String displayName;

    SettlementType(String displayName) {
        this.displayName = displayName;
    }

    public String getDisplayName() {
        return displayName;
    }
}
