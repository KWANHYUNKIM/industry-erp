package com.erp.accounting.vatreturn;

/** 부가세신고서 [신고서종류] — 예정/확정(석 달) · 월별신고(조기환급). */
public enum VatReturnKind {
    PRELIM("예정"),
    FINAL("확정"),
    MONTHLY("월별");

    private final String displayName;

    VatReturnKind(String displayName) {
        this.displayName = displayName;
    }

    public String getDisplayName() {
        return displayName;
    }
}
