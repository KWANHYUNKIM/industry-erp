package com.erp.trade.domain;

/** 발주서 진행 상태. 발주요청 → 발주계획 → 단가확정 → 발주확정 → 입고전환. */
public enum PurchaseOrderStatus {
    REQUESTED("발주요청"),
    PLANNED("발주계획"),
    PRICED("단가확정"),
    ORDERED("발주확정"),
    RECEIVED("입고전환"),
    CANCELLED("취소");

    private final String displayName;

    PurchaseOrderStatus(String displayName) {
        this.displayName = displayName;
    }

    public String getDisplayName() {
        return displayName;
    }
}
