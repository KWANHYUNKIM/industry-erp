package com.erp.domain;

/**
 * 작업지시 상태.
 */
public enum WorkOrderStatus {
    PLANNED("계획"),
    IN_PROGRESS("진행중"),
    COMPLETED("완료");

    private final String displayName;

    WorkOrderStatus(String displayName) {
        this.displayName = displayName;
    }

    public String getDisplayName() {
        return displayName;
    }
}
