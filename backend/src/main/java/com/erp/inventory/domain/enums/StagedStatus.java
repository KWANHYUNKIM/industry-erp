package com.erp.inventory.domain.enums;

/**
 * 단계별재고조정 진행상태. REQUESTED(요청) → APPLIED(반영완료) 또는 REJECTED(반려).
 * 즉시 반영하는 일반 재고조정과 달리 승인 단계를 거친다.
 */
public enum StagedStatus {
    REQUESTED("요청"),
    APPLIED("반영완료"),
    REJECTED("반려");

    private final String displayName;

    StagedStatus(String displayName) {
        this.displayName = displayName;
    }

    public String getDisplayName() {
        return displayName;
    }
}
