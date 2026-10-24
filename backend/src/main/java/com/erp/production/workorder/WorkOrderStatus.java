package com.erp.production.workorder;

/**
 * 작업지시 상태.
 */
public enum WorkOrderStatus {
    PLANNED("진행중")  /* 원본 새 작업지시서의 진행상태도 '진행중'(2026-10-22 실측) — 만든 것이 없을 뿐 같은 진행중이다 */,
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
