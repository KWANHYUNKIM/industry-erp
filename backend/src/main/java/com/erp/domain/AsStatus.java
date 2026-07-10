package com.erp.domain;

/** A/S 처리 상태. */
public enum AsStatus {
    RECEIVED("접수"),
    IN_PROGRESS("처리중"),
    COMPLETED("완료"),
    CANCELED("취소");

    private final String displayName;

    AsStatus(String displayName) {
        this.displayName = displayName;
    }

    public String getDisplayName() {
        return displayName;
    }
}
