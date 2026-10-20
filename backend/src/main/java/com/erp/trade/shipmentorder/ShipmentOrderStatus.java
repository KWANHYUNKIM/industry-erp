package com.erp.trade.shipmentorder;

/** 출하지시서 진행상태 — 원본 출하지시서조회의 [진행상태] 링크(진행중 · 완료). 출하가 이어져도 저절로 완료되지 않는다. */
public enum ShipmentOrderStatus {
    IN_PROGRESS("진행중"),
    COMPLETED("완료");

    private final String displayName;

    ShipmentOrderStatus(String displayName) {
        this.displayName = displayName;
    }

    public String getDisplayName() {
        return displayName;
    }
}
