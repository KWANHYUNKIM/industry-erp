package com.erp.domain;

/** 출하 진행 상태. */
public enum ShipmentStatus {
    READY("출하지시"),
    SHIPPED("출하완료"),
    CANCELED("취소");

    private final String displayName;

    ShipmentStatus(String displayName) {
        this.displayName = displayName;
    }

    public String getDisplayName() {
        return displayName;
    }
}
