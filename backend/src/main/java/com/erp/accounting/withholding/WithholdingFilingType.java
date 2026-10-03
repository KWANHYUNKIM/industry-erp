package com.erp.accounting.withholding;

/** 원천징수이행상황신고서의 [신고구분] — 원본 라디오 정기신고 · 기한후신고. */
public enum WithholdingFilingType {
    REGULAR("정기신고"),
    LATE("기한후신고");

    private final String displayName;

    WithholdingFilingType(String displayName) {
        this.displayName = displayName;
    }

    public String getDisplayName() {
        return displayName;
    }
}
