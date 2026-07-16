package com.erp.groupware.domain.enums;

/** 외근계 상태. 신청 → 승인 / 반려. */
public enum FieldWorkStatus {
    REQUESTED("신청"),
    APPROVED("승인"),
    REJECTED("반려");

    private final String displayName;

    FieldWorkStatus(String displayName) {
        this.displayName = displayName;
    }

    public String getDisplayName() {
        return displayName;
    }
}
