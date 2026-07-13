package com.erp.domain;

/** 급여명세 상태. */
public enum PayslipStatus {
    DRAFT("작성"),
    CONFIRMED("확정");

    private final String displayName;

    PayslipStatus(String displayName) {
        this.displayName = displayName;
    }

    public String getDisplayName() {
        return displayName;
    }
}
