package com.erp.domain;

/**
 * 품질검사 판정.
 */
public enum QualityResult {
    PASS("합격"),
    CONDITIONAL("조건부합격"),
    FAIL("불합격");

    private final String displayName;

    QualityResult(String displayName) {
        this.displayName = displayName;
    }

    public String getDisplayName() {
        return displayName;
    }
}
