package com.erp.groupware.domain;

/**
 * 결재선 각 단계의 처리 상태.
 */
public enum ApprovalLineStatus {
    PENDING("대기"),
    APPROVED("승인"),
    REJECTED("반려");

    private final String displayName;

    ApprovalLineStatus(String displayName) {
        this.displayName = displayName;
    }

    public String getDisplayName() {
        return displayName;
    }
}
