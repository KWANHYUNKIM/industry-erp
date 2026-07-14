package com.erp.domain.enums;

/** 법인세 신고서 상태. 확정된 신고서는 수정하지 않는다. */
public enum TaxReturnStatus {
    DRAFT("작성"),
    CONFIRMED("확정");

    private final String displayName;

    TaxReturnStatus(String displayName) {
        this.displayName = displayName;
    }

    public String getDisplayName() {
        return displayName;
    }
}
