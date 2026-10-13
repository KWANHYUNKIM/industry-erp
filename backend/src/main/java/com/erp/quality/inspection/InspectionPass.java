package com.erp.quality.inspection;

/** 품질검사 줄의 [합격여부] — 원본 후보 해당없음(기본) · 합격 · 불합격(2026-10-04 실측). */
public enum InspectionPass {
    NA("해당없음"),
    PASS("합격"),
    FAIL("불합격");

    private final String displayName;

    InspectionPass(String displayName) {
        this.displayName = displayName;
    }

    public String getDisplayName() {
        return displayName;
    }
}
