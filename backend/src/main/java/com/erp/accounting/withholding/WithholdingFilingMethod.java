package com.erp.accounting.withholding;

/** 원천징수이행상황신고서의 [신고방법] — 원본 라디오 매월 · 반기. 목록의 [신고구분(연말정산)] 칸에 찍힌다. */
public enum WithholdingFilingMethod {
    MONTHLY("매월"),
    HALF("반기");

    private final String displayName;

    WithholdingFilingMethod(String displayName) {
        this.displayName = displayName;
    }

    public String getDisplayName() {
        return displayName;
    }
}
