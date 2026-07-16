package com.erp.groupware.domain;

/**
 * 기안서 진행 상태.
 */
public enum ApprovalStatus {
    DRAFTING("기안중"),
    IN_PROGRESS("진행중"),
    APPROVED("완료"),
    REJECTED("반려");

    private final String displayName;

    ApprovalStatus(String displayName) {
        this.displayName = displayName;
    }

    public String getDisplayName() {
        return displayName;
    }
}
