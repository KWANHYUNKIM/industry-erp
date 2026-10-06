package com.erp.quality.inspection;

/** 품질검사 전표의 [종결여부] — 원본 탭 진행중 · 완료(2026-10-04 실측). 저장하면 진행중, 목록의 진행중을 누르면 완료. */
public enum InspectionStatus {
    IN_PROGRESS("진행중"),
    COMPLETED("완료");

    private final String displayName;

    InspectionStatus(String displayName) {
        this.displayName = displayName;
    }

    public String getDisplayName() {
        return displayName;
    }
}
