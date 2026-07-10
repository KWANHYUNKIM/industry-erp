package com.erp.domain;

/**
 * 재고 이동 유형.
 * INBOUND(입고): 수량 증가, OUTBOUND(출고): 수량 감소, ADJUST(조정): 실사 등에 의한 증감.
 */
public enum StockTransactionType {
    INBOUND("입고"),
    OUTBOUND("출고"),
    ADJUST("조정");

    private final String displayName;

    StockTransactionType(String displayName) {
        this.displayName = displayName;
    }

    public String getDisplayName() {
        return displayName;
    }
}
