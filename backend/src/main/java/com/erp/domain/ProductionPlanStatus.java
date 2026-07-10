package com.erp.domain;

/** 생산계획 상태. */
public enum ProductionPlanStatus {
    REVIEW("검토중"),
    CONFIRMED("확정"),
    ORDERED("지시완료");

    private final String displayName;

    ProductionPlanStatus(String displayName) {
        this.displayName = displayName;
    }

    public String getDisplayName() {
        return displayName;
    }
}
