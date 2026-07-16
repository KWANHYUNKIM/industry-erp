package com.erp.trade.domain;

/**
 * 거래처 구분. (이카운트의 매출처/매입처 구분)
 */
public enum PartnerType {
    CUSTOMER("매출처"),
    SUPPLIER("매입처"),
    BOTH("매출/매입");

    private final String displayName;

    PartnerType(String displayName) {
        this.displayName = displayName;
    }

    public String getDisplayName() {
        return displayName;
    }

    public boolean canSell() {
        return this == CUSTOMER || this == BOTH;
    }

    public boolean canBuy() {
        return this == SUPPLIER || this == BOTH;
    }
}
