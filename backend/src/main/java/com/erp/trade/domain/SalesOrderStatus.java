package com.erp.trade.domain;

/** 주문(수주) 진행 상태. */
public enum SalesOrderStatus {
    RECEIVED("접수"),
    IN_PROGRESS("진행중"),
    COMPLETED("완료"),
    CANCELED("취소");

    private final String displayName;

    SalesOrderStatus(String displayName) {
        this.displayName = displayName;
    }

    public String getDisplayName() {
        return displayName;
    }
}
