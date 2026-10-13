package com.erp.quality.inspection;

/** 품질검사 줄의 [검사방법] — 원본 후보 전수 · 샘플링(2026-10-04 실측). 전수면 시료 = 수량이다. */
public enum InspectionMethod {
    FULL("전수"),
    SAMPLING("샘플링");

    private final String displayName;

    InspectionMethod(String displayName) {
        this.displayName = displayName;
    }

    public String getDisplayName() {
        return displayName;
    }
}
